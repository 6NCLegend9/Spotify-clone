"""Bound subprocess lifetime, output, and temporary disk use without a shell."""
import asyncio
import os
import signal
import logging
import re


def redacted_preview_error(stderr):
    text = stderr.decode("utf-8", errors="replace")
    # Diagnostics are restricted to opt-in previews. Remove environment values
    # before generic URL/token redaction; never print signed media URLs.
    for value in sorted((v for v in os.environ.values() if len(v) >= 8), key=len, reverse=True):
        text = text.replace(value, "[redacted]")
    text = re.sub(r"https?://[^\s\"'<>]+", "[redacted URL]", text)
    text = re.sub(r"[A-Za-z0-9_+/=-]{32,}", "[redacted token]", text)
    return text[-1500:]


def failure_reason(stderr):
    """Classify upstream failures without exposing stderr, URLs, or cookies."""
    text = stderr.decode("utf-8", errors="replace").lower()
    if "confirm you're not a bot" in text or "confirm you’re not a bot" in text:
        return "source_access_restricted"
    if "certificate verify failed" in text or "certificate_verify_failed" in text:
        return "source_tls_failed"
    if any(value in text for value in ("video unavailable", "private video", "video has been removed", "this video is not available")):
        return "source_unavailable"
    if "challenge solving failed" in text or "javascript runtime" in text:
        return "source_challenge_failed"
    if "http error 403" in text:
        return "source_http_forbidden"
    return "upstream_tool_failed"


async def run_tool(argv, deadline_seconds, output_limit_bytes=4 * 1024 * 1024, directory=None, disk_limit=None):
    process = await asyncio.create_subprocess_exec(*argv, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, start_new_session=True)

    output_exceeded = asyncio.Event()

    async def collect(stream):
        data = bytearray()
        while chunk := await stream.read(65536):
            remaining = max(0, output_limit_bytes - len(data))
            data.extend(chunk[:remaining])
            if len(chunk) > remaining:
                output_exceeded.set()
            # Keep draining even after the cap. Stopping pipe reads can make
            # process.wait() hang after SIGKILL due to buffered transport data.
        return bytes(data)

    async def disk_guard():
        while True:
            await asyncio.sleep(.2)
            size = 0
            if directory and disk_limit:
                for path in directory.rglob("*"):
                    try:
                        if path.is_file():
                            size += path.stat().st_size
                    except FileNotFoundError:
                        pass  # Downloader/FFmpeg can atomically rename a part.
                if size > disk_limit:
                    raise ValueError("temporary_disk_limit")

    stdout = asyncio.create_task(collect(process.stdout))
    stderr = asyncio.create_task(collect(process.stderr))
    guard = asyncio.create_task(disk_guard())
    waiter = asyncio.create_task(process.wait())
    limiter = asyncio.create_task(output_exceeded.wait())
    async def finished():
        await asyncio.gather(waiter, stdout, stderr)
    completion = asyncio.create_task(finished())
    try:
        async with asyncio.timeout(deadline_seconds):
            done, _ = await asyncio.wait([completion, guard, limiter], return_when=asyncio.FIRST_COMPLETED)
            if output_exceeded.is_set():
                raise ValueError("tool_output_limit")
            for task in done:
                task.result()
    except TimeoutError:
        raise ValueError("tool_timeout") from None
    finally:
        if process.returncode is None or not completion.done():
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        try:
            async with asyncio.timeout(2):
                await asyncio.gather(waiter, stdout, stderr, return_exceptions=True)
        except TimeoutError:
            # asyncio Process has no public pipe-close API. Closing its
            # transport is the last-resort cleanup for inherited/open pipes.
            process._transport.close()
        guard.cancel()
        limiter.cancel()
        for task in (stdout, stderr, guard, waiter, completion, limiter):
            if not task.done():
                task.cancel()
        await asyncio.gather(stdout, stderr, guard, waiter, completion, limiter, return_exceptions=True)
    if process.returncode:
        # yt-dlp errors can contain signed URLs or authentication details.
        if os.environ.get("VERCEL_ENV") == "preview" and os.environ.get("MEDIA_SERVICE_DEPLOYMENT_PROBE") == "1":
            logging.getLogger("haykasa.media.preview").warning("Preview tool failure: %s", redacted_preview_error(stderr.result()))
        raise ValueError(failure_reason(stderr.result()))
    return stdout.result()
