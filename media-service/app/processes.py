"""Bound subprocess lifetime, output, and temporary disk use without a shell."""
import asyncio
import os
import signal


async def run_tool(argv, deadline_seconds, output_limit_bytes=4 * 1024 * 1024, directory=None, disk_limit=None):
    process = await asyncio.create_subprocess_exec(*argv, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, start_new_session=True)

    async def collect(stream):
        data = bytearray()
        while chunk := await stream.read(65536):
            data.extend(chunk)
            if len(data) > output_limit_bytes:
                raise ValueError("tool_output_limit")
        return bytes(data)

    async def disk_guard():
        while True:
            await asyncio.sleep(.2)
            if directory and disk_limit and sum(p.stat().st_size for p in directory.rglob("*") if p.is_file()) > disk_limit:
                raise ValueError("temporary_disk_limit")

    stdout = asyncio.create_task(collect(process.stdout))
    stderr = asyncio.create_task(collect(process.stderr))
    guard = asyncio.create_task(disk_guard())
    waiter = asyncio.create_task(process.wait())
    async def finished():
        await asyncio.gather(waiter, stdout, stderr)
    completion = asyncio.create_task(finished())
    try:
        async with asyncio.timeout(deadline_seconds):
            done, _ = await asyncio.wait([completion, guard], return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                task.result()
    except TimeoutError:
        raise ValueError("tool_timeout") from None
    finally:
        if process.returncode is None:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        await process.wait()
        guard.cancel()
        for task in (stdout, stderr, guard, waiter, completion):
            if not task.done():
                task.cancel()
        await asyncio.gather(stdout, stderr, guard, waiter, completion, return_exceptions=True)
    if process.returncode:
        # yt-dlp errors can contain signed URLs or authentication details.
        raise ValueError("upstream_tool_failed")
    return stdout.result()
