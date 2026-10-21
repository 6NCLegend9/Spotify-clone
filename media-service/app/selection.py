"""Select only source streams supported by the requested browser profile."""
import math
from types import SimpleNamespace


def number(value):
    try:
        value = float(value)
        return value if math.isfinite(value) and value > 0 else None
    except (TypeError, ValueError):
        return None


def audio_bitrate(fmt):
    return number(fmt.get("abr")) or (number(fmt.get("tbr")) if fmt.get("vcodec") == "none" else None)


def select_formats(info, request):
    formats = [f for f in info.get("formats", []) if isinstance(f, dict) and f.get("url") and str(f.get("format_id", "")).replace("-", "").isalnum() and not f.get("has_drm")]
    if request.profile == "auto":
        # yt-dlp sorts formats from worst to best, accounting for source quality,
        # language and codec. Preserve that ranking instead of equating bitrates.
        attempted = set()
        for candidate in reversed(formats):
            codec = str(candidate.get("acodec", ""))
            if candidate.get("vcodec") != "none" or not codec.startswith(("opus", "mp4a")):
                continue
            profile = "webm-opus" if codec.startswith("opus") else "mp4-aac"
            if profile in attempted:
                continue
            attempted.add(profile)
            try:
                selected = select_formats(info, SimpleNamespace(mode=request.mode, maxHeight=request.maxHeight, profile=profile))
                # The auto path keeps the upstream best-audio choice, while the
                # existing profile selector supplies its compatible video pair.
                qualities = [{**quality, "audioBitrateKbps": audio_bitrate(candidate)} for quality in selected[2]]
                return candidate, selected[1], qualities
            except ValueError:
                continue
        raise ValueError("compatible_audio_unavailable" if request.mode == "audio" else "compatible_video_unavailable")
    webm = request.profile == "webm-opus"
    audio = [f for f in formats if f.get("vcodec") == "none" and (str(f.get("acodec", "")).startswith("opus") if webm else str(f.get("acodec", "")).startswith("mp4a"))]
    # Compare bitrate within a codec profile; never imply AAC and Opus are equivalent.
    chosen_audio = max(audio, key=lambda f: (audio_bitrate(f) or 0, number(f.get("asr")) or 0), default=None)
    video = [f for f in formats if f.get("acodec") == "none" and number(f.get("height")) and (str(f.get("vcodec", "")).startswith(("vp9", "vp09")) if webm else str(f.get("vcodec", "")).startswith(("avc1", "h264")))]
    if not chosen_audio:
        raise ValueError("compatible_audio_unavailable")
    qualities = [{"height": int(h), "codec": "vp9/opus" if webm else "h264/aac", "audioBitrateKbps": audio_bitrate(chosen_audio)} for h in sorted({number(f.get("height")) for f in video})]
    selected_video = None
    if request.mode == "video":
        selected_video = max((f for f in video if number(f.get("height")) <= request.maxHeight), key=lambda f: (number(f.get("height")), number(f.get("fps")) or 0, number(f.get("tbr")) or 0), default=None)
        if not selected_video:
            raise ValueError("compatible_video_unavailable")
    return chosen_audio, selected_video, qualities
