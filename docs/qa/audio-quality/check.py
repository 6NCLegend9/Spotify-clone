"""Offline source selection and real FFmpeg packet-preservation checks."""
import asyncio
import json
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "media-service"))
from app.models import ResolveRequest
from app.selection import select_formats
from app import jobs


def request(profile="auto", mode="audio"):
    return ResolveRequest(videoId="abcdefghijk", mode=mode, profile=profile, maxHeight=1080)


def audio(identifier, codec, rate, **extra):
    return dict(format_id=identifier, url="https://example.invalid/source", acodec=codec,
                vcodec="none", abr=rate, asr=48000, **extra)


opus = audio("251", "opus", 154)
aac = audio("140", "mp4a.40.2", 128)
video = dict(format_id="137", url="https://example.invalid/video", acodec="none",
             vcodec="avc1.640028", height=1080, fps=30)
# The extractor sorts worst -> best. Respect its codec/language/quality ranking,
# including a better AAC source, rather than comparing AAC and Opus raw bitrates.
for formats, expected in [([aac, opus], "251"), ([opus, aac], "140"), ([aac], "140")]:
    chosen, _, _ = select_formats({"formats": formats}, request())
    assert chosen["format_id"] == expected
chosen, selected, qualities = select_formats({"formats": [aac, video, opus]}, request(mode="video"))
assert chosen["format_id"] == "140" and selected == video
assert qualities == [{"height": 1080, "codec": "h264/aac", "audioBitrateKbps": 128.0}]
chosen, _, _ = select_formats({"formats": [aac, audio("141", "mp4a.40.2", 256)]}, request("mp4-aac"))
assert chosen["format_id"] == "141"
for invalid in [dict(opus, has_drm=True), dict(opus, url=""), dict(opus, format_id="../../file"), audio("999", "unsupported", 900)]:
    assert select_formats({"formats": [aac, invalid]}, request())[0] == aac
try:
    select_formats({"formats": [dict(opus, has_drm=True)]}, request())
    raise AssertionError("DRM-only source was accepted")
except ValueError as error:
    assert str(error) == "compatible_audio_unavailable"


def run(*args):
    return subprocess.run(args, check=True, capture_output=True).stdout


def packet_hashes(path):
    return json.loads(run("ffprobe", "-v", "error", "-select_streams", "a:0", "-show_packets",
                          "-show_data_hash", "sha256", "-show_entries", "packet=data_hash", "-of", "json", str(path)))["packets"]


async def prepare_codec(root, codec, extension, profile, estimated):
    source = root / f"fixture.{extension}"
    run("ffmpeg", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=997:duration=2:sample_rate=48000",
        "-ac", "2", "-c:a", "libopus" if codec == "opus" else "aac", "-b:a", "160k", str(source))
    cache = root / f"cache-{codec}"
    config = SimpleNamespace(cache=cache, workers=1, queue_size=2, file_limit=1024*1024,
        disk_limit=10*1024*1024, ttl=600, duration_limit=10, extract_deadline=10,
        prepare_deadline=20, js_runtime="node")
    manager = jobs.JobManager(config)
    directory = cache / "job-fixture"
    directory.mkdir()
    selected = opus if codec == "opus" else aac
    fixture_info = {"duration": 2, "formats": [selected]}
    commands = []
    actual_tool = jobs.run_tool

    async def local_tools(args, deadline, **kwargs):
        commands.append(args)
        if "yt_dlp" in args:
            assert args[-1] == "https://www.youtube.com/watch?v=abcdefghijk"
            if "--dump-single-json" in args:
                return json.dumps(fixture_info).encode()
            assert args[args.index("--format") + 1] == selected["format_id"]
            destination = args[args.index("--output") + 1].replace("%(ext)s", extension)
            shutil.copyfile(source, destination)
            return b""
        return await actual_tool(args, deadline, **kwargs)

    job = dict(id="fixture", request=request(profile), directory=directory, state="pending", created=time.time())
    with patch.object(jobs, "run_tool", local_tools):
        await manager.prepare(job)
    assert job["state"] == "ready", job.get("reason")
    descriptor = job["asset"]["descriptor"]
    assert descriptor["codec"] == codec
    assert descriptor["sampleRateHz"] == 48000 and descriptor["channels"] == 2
    assert descriptor["audioBitrateKbps"] > 0
    assert descriptor["audioBitrateEstimated"] is estimated
    assert descriptor["mimeType"] == ("audio/webm" if codec == "opus" else "audio/mp4")
    assert packet_hashes(source) == packet_hashes(job["asset"]["path"]), "Remux changed compressed audio packets"
    remux = next(command for command in commands if command[0] == "ffmpeg")
    assert remux[remux.index("-c") + 1] == "copy"
    print(f"PASS: {profile} -> {codec}, 48 kHz stereo, packet-identical remux, measured quality metadata")


async def main():
    with tempfile.TemporaryDirectory(prefix="haykasa-audio-quality-") as directory:
        root = Path(directory)
        await prepare_codec(root, "opus", "webm", "auto", True)
        await prepare_codec(root, "aac", "m4a", "auto", False)
    print("PASS: upstream-ranked automatic codec choice, AAC/Opus fallback, compatible video pairing, DRM and malformed format rejection")


asyncio.run(main())
