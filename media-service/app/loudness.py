"""Measure the encoded asset after remuxing so metadata matches delivery."""
import json
import math

from .processes import run_tool


async def measure_loudness(path):
    try:
        report = await run_tool([
            "ffmpeg", "-nostdin", "-hide_banner", "-nostats", "-v", "info",
            "-i", str(path), "-map", "0:a:0", "-af", "loudnorm=print_format=json",
            "-f", "null", "-",
        ], 20, output_limit_bytes=65536, capture_stderr=True)
        start = report.rindex(b"{")
        measurement = json.loads(report[start:report.index(b"}", start) + 1])
        integrated = float(measurement["input_i"])
        peak = float(measurement["input_tp"])
        if math.isfinite(integrated) and math.isfinite(peak) and -70 < integrated <= 10 and -100 <= peak <= 20:
            return {"integratedLufs": integrated, "truePeakDbfs": peak}
    except (ValueError, KeyError, TypeError, OSError):
        # Missing measurements must not make a playable asset unavailable.
        pass
    return None
