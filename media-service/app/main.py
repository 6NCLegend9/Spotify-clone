from contextlib import asynccontextmanager
import hmac
import re
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from .assets import deliver
from .config import Config
from .jobs import JobManager
from .models import ResolveRequest

config = Config()


@asynccontextmanager
async def lifespan(application):
    application.state.manager = JobManager(config)
    yield
    await application.state.manager.close()


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(CORSMiddleware, allow_origins=config.origins, allow_methods=["GET", "HEAD"], allow_headers=["Range"], expose_headers=["Accept-Ranges", "Content-Range", "Content-Length"], max_age=600)


def subscriber(authorization: str = Header(default=""), x_media_subscriber: str = Header(default="")):
    if not hmac.compare_digest(authorization, f"Bearer {config.api_key}") or not re.fullmatch(r"[a-f0-9]{64}", x_media_subscriber):
        raise HTTPException(401, "unauthorized")
    return x_media_subscriber


def manager(request: Request):
    return request.app.state.manager


@app.middleware("http")
async def no_store(request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "private, no-store"
    return response


@app.get("/health")
async def health():
    return {"ready": True}


@app.post("/v1/jobs")
async def create_job(body: ResolveRequest, who=Depends(subscriber), jobs=Depends(manager)):
    try:
        return jobs.create(body, who)
    except ValueError:
        raise HTTPException(503, "capacity_unavailable") from None


@app.get("/v1/jobs/{job_id}")
@app.post("/v1/jobs/{job_id}/renew")
async def get_job(job_id: str, who=Depends(subscriber), jobs=Depends(manager)):
    try:
        return jobs.get(job_id, who)
    except KeyError:
        raise HTTPException(404, "job_unavailable") from None


@app.delete("/v1/jobs/{job_id}")
async def cancel_job(job_id: str, who=Depends(subscriber), jobs=Depends(manager)):
    try:
        return jobs.cancel(job_id, who)
    except KeyError:
        raise HTTPException(404, "job_unavailable") from None


@app.api_route("/v1/assets/{asset_id}", methods=["GET", "HEAD"])
async def asset(asset_id: str, request: Request, expires: int = 0, signature: str = "", jobs=Depends(manager)):
    value = jobs.assets.get(asset_id)
    if not value or len(signature) != 64:
        raise HTTPException(404, "asset_unavailable")
    return deliver(config, value, request, expires, signature)
