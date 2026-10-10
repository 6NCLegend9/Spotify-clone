"""Single-process shared jobs, subscriber cancellation, and bounded disk cache."""
import asyncio
import json
import shutil
import sys
import time
import uuid
from pathlib import Path
from .assets import lease
from .processes import run_tool
from .selection import select_formats, number, audio_bitrate


class JobManager:
    def __init__(self, config):
        self.config = config
        self.jobs = {}
        self.by_key = {}
        self.assets = {}
        self.reserved = 0
        self.semaphore = asyncio.Semaphore(config.workers)
        config.cache.mkdir(parents=True, exist_ok=True)
        # A process restart invalidates jobs/leases. Only owned cache entries are
        # removed; never recursively clear an arbitrary configured directory.
        for path in config.cache.glob("job-*"):
            if path.is_dir() and not path.is_symlink():
                shutil.rmtree(path)

    def cleanup(self):
        now = time.time()
        for job_id, job in list(self.jobs.items()):
            if job["state"] not in {"pending"} and now - job["created"] > self.config.ttl and job.get("asset", {}).get("leased_until", 0) < now:
                self.remove(job_id)

    def remove(self, job_id):
        job = self.jobs.pop(job_id, None)
        if not job:
            return
        if self.by_key.get(job["request"].key()) == job_id:
            self.by_key.pop(job["request"].key(), None)
        asset = job.get("asset")
        if asset:
            self.assets.pop(asset["id"], None)
        shutil.rmtree(job["directory"], ignore_errors=True)

    def reserve(self):
        amount = 2 * self.config.file_limit
        def used():
            return sum(a["size"] for a in self.assets.values()) + self.reserved
        for job in sorted(self.jobs.values(), key=lambda j: j.get("asset", {}).get("accessed", j["created"])):
            if used() + amount <= self.config.disk_limit:
                break
            if job["state"] != "pending" and job.get("asset", {}).get("leased_until", 0) < time.time():
                self.remove(job["id"])
        if used() + amount > self.config.disk_limit or shutil.disk_usage(self.config.cache).free < amount:
            raise ValueError("cache_full")
        self.reserved += amount
        return amount

    def create(self, request, subscriber):
        self.cleanup()
        existing = self.jobs.get(self.by_key.get(request.key()))
        if existing and existing["state"] != "failed":
            if len(existing["subscribers"]) >= 1000 and subscriber not in existing["subscribers"]:
                raise ValueError("queue_full")
            existing["subscribers"].add(subscriber)
            return self.result(existing)
        if sum(j["state"] == "pending" for j in self.jobs.values()) >= self.config.workers + self.config.queue_size or len(self.jobs) >= 1000:
            raise ValueError("queue_full")
        job_id = uuid.uuid4().hex
        directory = self.config.cache / f"job-{job_id}"
        directory.mkdir()
        job = {"id": job_id, "request": request, "state": "pending", "created": time.time(), "directory": directory, "subscribers": {subscriber}}
        self.jobs[job_id] = job
        self.by_key[request.key()] = job_id
        job["task"] = asyncio.create_task(self.prepare(job))
        return self.result(job)

    def owned(self, job_id, subscriber):
        job = self.jobs.get(job_id)
        if not job or subscriber not in job["subscribers"]:
            raise KeyError("job_unavailable")
        return job

    def result(self, job):
        value = {"jobId": job["id"], "state": job["state"]}
        if job["state"] == "ready":
            value.update(asset=lease(self.config, job["asset"]), qualities=job["qualities"])
        elif job["state"] == "failed":
            value["reason"] = job.get("reason", "preparation_failed")
        return value

    def get(self, job_id, subscriber):
        return self.result(self.owned(job_id, subscriber))

    def cancel(self, job_id, subscriber):
        job = self.owned(job_id, subscriber)
        job["subscribers"].discard(subscriber)
        if not job["subscribers"] and job["state"] == "pending":
            job.update(state="failed", reason="cancelled")
            job["task"].cancel()
            job["task"].add_done_callback(lambda _: shutil.rmtree(job["directory"], ignore_errors=True))
        return {"cancelled": True}

    def base_args(self):
        return [sys.executable, "-m", "yt_dlp", "--ignore-config", "--no-playlist", "--no-cache-dir", "--compat-options", "no-certifi", "--js-runtimes", self.config.js_runtime, "--socket-timeout", "10", "--retries", "0", "--extractor-retries", "0", "--no-progress"]

    async def prepare(self, job):
        reservation = 0
        try:
            async with self.semaphore:
                reservation = self.reserve()
                request, directory = job["request"], job["directory"]
                url = f"https://www.youtube.com/watch?v={request.videoId}"
                raw = await run_tool(self.base_args() + ["--skip-download", "--dump-single-json", url], self.config.extract_deadline)
                info = json.loads(raw)
                duration = number(info.get("duration"))
                if not duration or duration > self.config.duration_limit or info.get("is_live"):
                    raise ValueError("source_duration_unsupported")
                audio, video, qualities = select_formats(info, request)
                fmt = str(audio["format_id"]) if not video else f"{video['format_id']}+{audio['format_id']}"
                webm = request.profile == "webm-opus"
                container = "webm" if webm else "mp4"
                async with asyncio.timeout(self.config.prepare_deadline):
                    await run_tool(self.base_args() + ["--format", fmt, "--max-filesize", str(self.config.file_limit), "--merge-output-format", container, "--output", str(directory / "source.%(ext)s"), url], self.config.prepare_deadline, directory=directory, disk_limit=reservation)
                    sources = [p for p in directory.glob("source.*") if p.suffix in {".webm", ".m4a", ".mp4"}]
                    if len(sources) != 1:
                        raise ValueError("source_download_incomplete")
                    output = directory / f"asset.{container}"
                    args = ["ffmpeg", "-nostdin", "-v", "error", "-i", str(sources[0]), "-map", "0:a:0"]
                    if video:
                        args += ["-map", "0:v:0"]
                    args += ["-c", "copy"]
                    if not webm:
                        args += ["-movflags", "+faststart"]
                    await run_tool(args + [str(output)], self.config.prepare_deadline, directory=directory, disk_limit=reservation)
                    probe = json.loads(await run_tool(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(output)], 10))
                actual_duration = number(probe.get("format", {}).get("duration"))
                streams = probe.get("streams", [])
                actual_audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
                actual_video = next((s for s in streams if s.get("codec_type") == "video"), None)
                if not actual_duration or actual_duration > self.config.duration_limit + 1 or not actual_audio or actual_audio.get("codec_name") != ("opus" if webm else "aac") or (video and (not actual_video or actual_video.get("codec_name") != ("vp9" if webm else "h264"))):
                    raise ValueError("prepared_media_invalid")
                if output.stat().st_size > self.config.file_limit:
                    raise ValueError("asset_size_limit")
                for path in directory.iterdir():
                    if path != output and path.is_file():
                        path.unlink()
                asset_id = uuid.uuid4().hex
                asset = {"id": asset_id, "path": output, "size": output.stat().st_size, "accessed": time.time(), "leased_until": 0, "descriptor": {"mimeType": f"{'video' if video else 'audio'}/{container}", "duration": actual_duration, "codec": ("vp9/opus" if webm else "h264/aac") if video else ("opus" if webm else "aac"), "audioBitrateKbps": audio_bitrate(audio), "height": int(actual_video["height"]) if actual_video else None}}
                job.update(state="ready", asset=asset, qualities=qualities)
                self.assets[asset_id] = asset
        except asyncio.CancelledError:
            job.update(state="failed", reason="cancelled")
            shutil.rmtree(job["directory"], ignore_errors=True)
            raise
        except Exception as error:
            allowed = {"compatible_audio_unavailable", "compatible_video_unavailable", "source_duration_unsupported", "queue_full", "cache_full", "tool_timeout", "temporary_disk_limit", "asset_size_limit"}
            reason = str(error)
            job.update(state="failed", reason=reason if reason in allowed else "preparation_failed")
            shutil.rmtree(job["directory"], ignore_errors=True)
        finally:
            self.reserved -= reservation

    async def close(self):
        tasks = [j["task"] for j in self.jobs.values() if not j["task"].done()]
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
