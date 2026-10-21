# Audio fidelity checks — 2026-10-21

The existing search, selected song IDs and queue remain intact. Native playback is eligible across signed-in web, desktop and Android, behind the existing activation gate. `auto` negotiates Opus/AAC within the selected source; single-codec clients keep explicit profiles. FFmpeg remuxes with `-c copy`. Prepared quality metadata reports the delivered source, rather than advertising an artificial 320 kbps conversion.

Original/flat browser-native audio bypasses compression. Quiet applies its gain once. EQ boosts reserve headroom using the combined frequency response of all six filters, because neighboring bands overlap; the limiter remains for intentional boosts. The standalone audio player reuses the same graph. Native Android uses ExoPlayer rather than this browser DSP; its existing level control now receives Quiet gain once instead of ignoring it.

## Reproduction

1. Install the pinned media dependencies and FFmpeg, then run `python3 docs/qa/audio-quality/check.py`.
2. Install Playwright/browser engines, then run `node docs/qa/audio-quality/browser.cjs`. Set `AUDIO_TEST_BROWSERS=chromium,firefox,webkit` for the complete engine matrix.
3. Run the existing resolver, background playback, Vercel and security regression checks, then `npm run check`.

The Python check uses the real job preparation implementation with isolated extractor/download adapters and real FFmpeg/FFprobe. AAC and Opus output packet SHA-256 lists match their inputs exactly. Both deliver 48 kHz stereo fixture audio and valid measured/estimated metadata. It also checks upstream-ranked codec choice, AAC-only fallback, compatible video pairing, DRM and malformed format rejection. No network extraction is mocked as a live success.

The browser check renders a real 48 kHz stereo signal through the production Web Audio graph. It requires less than `0.000001` sample error for original playback, one Quiet gain and mono averaging, checks provider/master/fade volume composition, and tests output headroom with every EQ band boosted. Measurements are retained in `artifacts/audio-quality/dsp.json` and uploaded by Mobile Playback VM.

The shared hook retains its real media source across React Strict Mode's immediate effect replay and closes the context on actual unmount. Browser measurements require one live context while mounted and a closed context after cleanup.

The first run reproduced a peak of `1.014215` with every band at +12 dB and Loud selected. This exceeded the digital output range despite the old largest-band headroom rule and compressor. The combined-response headroom correction passed the repeat. Original and Quiet preserve source dynamics without a compressor in the path.

## Hosted verification — 2026-10-21

Preview `dpl_HgLpaiADLKBXf6FrYDVRxbanCu7p`, source `a0d39d19ad0830ad12d6e90753c1c1b45bd63ab1`, deployed successfully. The real `/api/media/preflight` returned HTTP 503: storage and signed byte ranges passed, then `extraction_mp4-aac` failed with `source_access_restricted`. The first fetch while building failed deployment authentication; a request after READY reached the actual worker and returned this source failure. The project's preview diagnostic flag was reset to zero afterward. Production playback remains disabled. PyPI's stable versions match the existing pins: yt-dlp `2026.8.19` and EJS `0.8.0`.

CI, security, homepage, playlist and three-engine browser checks passed for that runtime. The first Android run passed APK/AAB builds and all ten Android 13 tests. Android 16 passed nine tests but its background test hit `ActivityScenario.getState()` during a STARTED-to-RESUMED transition and threw from the test framework. The repeat observes the original activity through the lifecycle monitor instead of querying an unstable scenario state. A new native decoder check uses actual generated 48 kHz stereo Opus and AAC, requires decoded buffers/time progression and measures output gain; it supplements the existing WAV background fixture.

Successful worker health and synthetic audio do not resolve the upstream failure. These fidelity tests do not prove live extraction, physical speaker audibility or background playback on a physical phone. YouTube and yt-dlp use the same source; this pipeline cannot create lossless detail or guarantee 320 kbps when the source does not supply it. See [hosted extraction results](../vercel-media/RESULTS.md).
