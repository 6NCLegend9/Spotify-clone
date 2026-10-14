"""Stateless Vercel adapter: finish preparation in-request; private Blob persistence.

No detached jobs or local files are required by later requests. The private
service binding protects RPC reachability; application HMAC keys also protect
RPC and expiring public asset leases. Blob credentials never reach clients.
"""
import asyncio
import hashlib
import hmac
import json
import os
import re
import tempfile
import time
import uuid
import logging
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlsplit

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response, StreamingResponse
from vercel.blob import AsyncBlobClient

from .assets import lease, signature as sign_asset
from .body_limit import JobBodyLimit
from .config import origin
from .jobs import JobManager
from .models import ResolveRequest
from .processes import run_tool, redacted_preview_error

PREFIX = "haykasa/mobile-media/v1/"
TTL = 6 * 3600
LEASE_SECONDS = 2 * 3600
FILE_LIMIT = 96 * 1024**2
secret = os.environ.get("JWT_SECRET", "")
if len(secret) < 32 or not os.environ.get("BLOB_READ_WRITE_TOKEN"):
    raise ValueError("JWT_SECRET and a private BLOB_READ_WRITE_TOKEN are required")


def key(purpose):
    return hmac.new(secret.encode(), f"HayKasa/media-service/{purpose}/v1".encode(), hashlib.sha256).hexdigest()


API_KEY = key("api")
LEASE_KEY = key("lease")
preparations = asyncio.Semaphore(2)
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(JobBodyLimit)


def valid_id(value):
    return bool(re.fullmatch(r"[a-f0-9]{32}", value))


def paths(job_id):
    if not valid_id(job_id):
        raise HTTPException(404, "job_unavailable")
    return f"{PREFIX}{job_id}/asset", f"{PREFIX}{job_id}/manifest.json"


def created(job_id):
    return int(job_id[:8], 16)


async def subscriber(authorization: str = Header(default=""), x_media_subscriber: str = Header(default="")):
    if not hmac.compare_digest(authorization.encode(), f"Bearer {API_KEY}".encode()) or not re.fullmatch(r"[a-f0-9]{64}", x_media_subscriber):
        raise HTTPException(401, "unauthorized")
    return x_media_subscriber


def public_origin(request):
    try:
        value = origin(request.headers.get("x-media-public-origin", ""))
        if urlsplit(value).scheme != "https":
            raise ValueError()
        return value
    except ValueError:
        raise HTTPException(400, "origin_invalid") from None


@app.middleware("http")
async def protect(request, call_next):
    if request.url.path.startswith("/v1/jobs") and not hmac.compare_digest(request.headers.get("authorization", "").encode(), f"Bearer {API_KEY}".encode()):
        return JSONResponse({"detail": "unauthorized"}, status_code=401)
    try:
        response = await call_next(request)
    except Exception as error:
        if os.environ.get("VERCEL_ENV") == "preview" and os.environ.get("MEDIA_SERVICE_DEPLOYMENT_PROBE") == "1":
            logging.getLogger("haykasa.media.preview").warning("Preview service failure: %s", redacted_preview_error(str(error).encode()))
        response = JSONResponse({"detail": "service_unavailable"}, status_code=503)
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.exception_handler(RequestValidationError)
async def invalid_request(_request, _error):
    return JSONResponse({"detail": "request_invalid"}, status_code=422)


@app.exception_handler(Exception)
async def unavailable(_request, _error):
    # SDK errors can contain private URLs or storage credentials. Clients get
    # a stable retryable error without serializing provider diagnostics.
    return JSONResponse({"detail": "service_unavailable"}, status_code=503,
        headers={"Cache-Control": "private, no-store"})


async def read_manifest(client, job_id, who=None):
    _, path = paths(job_id)
    if created(job_id) + TTL <= time.time():
        raise HTTPException(404, "job_unavailable")
    result = await client.get(path, access="private", use_cache=False, timeout=8)
    if result is None or result.status_code != 200:
        raise HTTPException(404, "job_unavailable")
    data = result.content
    if not isinstance(data, bytes) or len(data) > 64_000:
        raise HTTPException(503, "storage_unavailable")
    value = json.loads(data)
    if value.get("jobId") != job_id or (who is not None and not hmac.compare_digest(value.get("subscriber", ""), who)):
        raise HTTPException(404, "job_unavailable")
    return value


def result(value, delivery_origin):
    seconds = min(LEASE_SECONDS, int(created(value["jobId"]) + TTL - time.time()))
    if seconds <= 0:
        raise HTTPException(404, "job_unavailable")
    config = SimpleNamespace(lease_key=LEASE_KEY, public_origin=delivery_origin, lease_seconds=seconds)
    asset = {"id": value["jobId"], "descriptor": value["descriptor"]}
    return {"jobId": value["jobId"], "state": "ready", "asset": lease(config, asset), "qualities": value["qualities"]}


async def cleanup(client):
    # At most 1,000 objects per sweep. Refuse new work when the bounded cache
    # fills rather than let the store grow without limit. No other prefixes
    # in the connected store are touched.
    page = await client.list_objects(prefix=PREFIX, limit=1000)
    stale = []
    live = 0
    for blob in page.blobs:
        job_id = blob.pathname.removeprefix(PREFIX).split("/")[0]
        if valid_id(job_id) and created(job_id) + TTL <= time.time():
            stale.append(blob.pathname)
        else:
            live += 1
    if stale:
        await client.delete(stale)
    if page.has_more or live >= 998:
        raise HTTPException(503, "capacity_unavailable")


async def persist(client, asset, qualities, who, uploaded):
    job_id = f"{int(time.time()):08x}{uuid.uuid4().hex[:24]}"
    asset_path, manifest_path = paths(job_id)
    blob = await client.put(asset_path, asset["path"].read_bytes(), access="private",
        content_type=asset["descriptor"]["mimeType"], add_random_suffix=False, multipart=True)
    uploaded.append(blob.pathname)
    value = {"jobId": job_id, "subscriber": who, "url": blob.url, "size": asset["size"],
        "descriptor": asset["descriptor"], "qualities": qualities}
    manifest = await client.put(manifest_path, json.dumps(value).encode(), access="private",
        content_type="application/json", add_random_suffix=False)
    uploaded.append(manifest.pathname)
    return value


@app.post("/v1/probes/storage")
async def storage_probe(request: Request, who=Depends(subscriber)):
    if os.environ.get("VERCEL_ENV") != "preview" or os.environ.get("MEDIA_SERVICE_DEPLOYMENT_PROBE") != "1":
        raise HTTPException(404, "not_found")
    client, uploaded = AsyncBlobClient(), []
    try:
        async with asyncio.timeout(30):
            await cleanup(client)
            with tempfile.TemporaryDirectory(prefix="haykasa-storage-probe-") as temporary:
                path = Path(temporary) / "fixture.m4a"
                await run_tool(["ffmpeg", "-nostdin", "-v", "error", "-f", "lavfi", "-i",
                    "sine=frequency=440:duration=2", "-c:a", "aac", "-movflags", "+faststart", str(path)], 10)
                asset = {"path": path, "size": path.stat().st_size, "descriptor": {
                    "mimeType": "audio/mp4", "duration": 2, "codec": "aac", "height": None, "audioBitrateKbps": 64}}
                value = await persist(client, asset, [], who, uploaded)
                return result(value, public_origin(request))
    except BaseException:
        if uploaded:
            await client.delete(uploaded)
        raise


@app.get("/health")
@app.get("/media-health")
async def health():
    return {"ready": True, "storage": "private-blob", "jobs": "request-scoped",
        "probeEnabled": os.environ.get("VERCEL_ENV") == "preview" and os.environ.get("MEDIA_SERVICE_DEPLOYMENT_PROBE") == "1"}


@app.post("/v1/jobs")
async def create_job(body: ResolveRequest, request: Request, who=Depends(subscriber)):
    delivery_origin = public_origin(request)
    # Acquire with a short bound instead of letting autoscaled requests queue
    # unboundedly inside one small container.
    try:
        await asyncio.wait_for(preparations.acquire(), 1)
    except TimeoutError:
        raise HTTPException(503, "capacity_unavailable") from None
    uploaded = []
    client = AsyncBlobClient()
    try:
        async with asyncio.timeout(230):
            await cleanup(client)
            with tempfile.TemporaryDirectory(prefix="haykasa-request-") as temporary:
                config = SimpleNamespace(cache=Path(temporary), workers=1, queue_size=0, file_limit=FILE_LIMIT,
                    disk_limit=2 * FILE_LIMIT, ttl=TTL, extract_deadline=45, prepare_deadline=120,
                    duration_limit=1800, js_runtime="node:/usr/local/bin/node", lease_key=LEASE_KEY,
                    public_origin=delivery_origin, lease_seconds=LEASE_SECONDS)
                manager = JobManager(config)
                try:
                    job = manager.create(body, who)
                    record = manager.jobs[job["jobId"]]
                    await record["task"]
                    if record["state"] != "ready":
                        return {"jobId": job["jobId"], "state": "failed", "reason": record.get("reason", "source_unavailable")}
                    value = await persist(client, record["asset"], record["qualities"], who, uploaded)
                    return result(value, delivery_origin)
                finally:
                    await manager.close()
    except asyncio.CancelledError:
        if uploaded:
            await client.delete(uploaded)
        raise
    except TimeoutError:
        if uploaded:
            await client.delete(uploaded)
        raise HTTPException(503, "preparation_timeout") from None
    except HTTPException:
        raise
    except Exception:
        if uploaded:
            await client.delete(uploaded)
        raise HTTPException(503, "service_unavailable") from None
    finally:
        preparations.release()


@app.get("/v1/jobs/{job_id}")
@app.post("/v1/jobs/{job_id}/renew")
async def get_job(job_id: str, request: Request, who=Depends(subscriber)):
    value = await read_manifest(AsyncBlobClient(), job_id, who)
    return result(value, public_origin(request))


@app.delete("/v1/jobs/{job_id}")
async def cancel_job(job_id: str, who=Depends(subscriber)):
    client = AsyncBlobClient()
    await read_manifest(client, job_id, who)
    await client.delete(list(paths(job_id)))
    return {"cancelled": True}


def byte_range(value, size):
    start, end, status = 0, size - 1, 200
    if value:
        match = re.fullmatch(r"bytes=(\d{0,20})-(\d{0,20})", value)
        if not match or not any(match.groups()):
            raise ValueError()
        left, right = match.groups()
        if left:
            start = int(left)
            end = min(int(right), end) if right else end
        else:
            if int(right) <= 0:
                raise ValueError()
            start = max(0, size - int(right))
        if start > end or start >= size:
            raise ValueError()
        status = 206
    return start, end, status


@app.api_route("/v1/assets/{asset_id}", methods=["GET", "HEAD"])
async def asset(asset_id: str, request: Request, expires: int = 0, signature: str = ""):
    if not valid_id(asset_id) or not re.fullmatch(r"[a-f0-9]{64}", signature):
        raise HTTPException(404, "asset_unavailable")
    if expires <= time.time() or expires > min(time.time() + LEASE_SECONDS + 60, created(asset_id) + TTL) or not hmac.compare_digest(sign_asset(LEASE_KEY, asset_id, expires), signature):
        raise HTTPException(403, "lease_invalid")
    value = await read_manifest(AsyncBlobClient(), asset_id)
    url = urlsplit(value["url"])
    if url.scheme != "https" or not (url.hostname or "").endswith(".private.blob.vercel-storage.com") or url.username or url.password or url.query or url.fragment:
        raise HTTPException(503, "storage_unavailable")
    size = value["size"]
    if not isinstance(size, int) or size <= 0 or size > FILE_LIMIT:
        raise HTTPException(503, "storage_unavailable")
    headers = {"Accept-Ranges": "bytes", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"}
    try:
        start, end, status = byte_range(request.headers.get("range"), size)
    except ValueError:
        return Response(status_code=416, headers={**headers, "Content-Range": f"bytes */{size}"})
    length = end - start + 1
    headers["Content-Length"] = str(length)
    if status == 206:
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    mime = value["descriptor"]["mimeType"]
    if request.method == "HEAD":
        return Response(status_code=status, headers=headers, media_type=mime)
    client = httpx.AsyncClient(timeout=httpx.Timeout(30, read=60), follow_redirects=False)
    try:
        upstream = await client.send(client.build_request("GET", value["url"], headers={
            "Authorization": f"Bearer {os.environ['BLOB_READ_WRITE_TOKEN']}", "Range": f"bytes={start}-{end}",
            "Accept-Encoding": "identity"}), stream=True)
        # A server ignoring Range must never produce a falsely labelled slice.
        if upstream.status_code != 206 or upstream.headers.get("content-range") != f"bytes {start}-{end}/{size}":
            await upstream.aclose()
            raise HTTPException(503, "storage_unavailable")
    except BaseException:
        await client.aclose()
        raise

    async def chunks():
        remaining = length
        try:
            async for chunk in upstream.aiter_raw():
                if len(chunk) > remaining:
                    raise RuntimeError("invalid_storage_length")
                remaining -= len(chunk)
                yield chunk
            if remaining:
                raise RuntimeError("incomplete_storage_read")
        finally:
            await upstream.aclose()
            await client.aclose()
    return StreamingResponse(chunks(), status_code=status, headers=headers, media_type=mime)
