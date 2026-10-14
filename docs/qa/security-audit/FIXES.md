# Audit remediation on PR #28

The baseline [audit report](REPORT.md) records findings at `b735f29`. The following changes address all 13 findings; browser and Windows runtime verification remain separate.

| Finding | Change | Regression evidence |
| --- | --- | --- |
| F01 | Output collectors cap retained bytes and continue draining. An overflow signal terminates the process group; cleanup has a two-second deadline and transport-close fallback. | A real 6 MiB child output returns `tool_output_limit` instead of reaching the three-second supervisor kill; ordinary timeout still works. |
| F02 | JSON readers count actual received UTF-8 bytes, cancel failed readers, handle malformed encoding and return 413. Defaults are 64 KiB; playlist mutations allow 384 KiB, desktop exchange/media requests 4 KiB, and NextAuth POST 16 KiB. | Oversized and forged-length streams reject early; the NextAuth adapter preserves encoded forms, cookies and route context. |
| F03 | Audio imports reject empty/unsupported/>32 MiB files before reading. Decoder output is limited to 10 minutes, two channels, 96 kHz and 60 million samples. Cancellation closes the audio context and prevents stale selections from applying. | A declared 1 GiB file never reaches arrayBuffer; a pending read settles on cancellation. Browser codec decoding remains unverified. |
| F04 | Category and alias lookups require own properties. | `__proto__`, `constructor` and `toString` normalize to Pop without schema errors. |
| F05 | Covers require canonical nonempty base64 and actual JPEG/PNG/WebP decoding with matching format, single-frame/pixel/dimension limits. Sharp re-encodes 400×400 JPEGs and removes input metadata. Existing broken artwork gets a UI fallback. | Corrupt/renamed payloads reject; a real PNG successfully becomes a 400×400 JPEG; a PNG labeled JPEG rejects. |
| F06 | ASGI middleware counts received bytes for job mutations, including unknown/forged length. Validation errors omit input values and bound locations/error count. | Oversized, forged-length and chunked bodies return small 413s; a small invalid request produces a small 422. |
| F07 | Content-Length validation bounds digit count and checks ASCII digits before conversion. | A 5,000-digit header returns 413 instead of 500. |
| F08 | Cover reads/decode reject aborts and timeouts, remove event handlers, cancel active readers and suppress stale/unmounted updates. | The abort fixture rejects instead of remaining pending. |
| F09 | Native logs use a stable failure value for free-text error fields; other text strips URLs, bearer/JWT/assignment secrets and email addresses. Existing logs are scrubbed on startup; tails are bounded and sanitized again. | Synthetic secrets are absent from new logs, old log files and diagnostic tails. |
| F10 | All sign-out actions purge account history/playback/recommendation/view/Jam caches, clear client response caches and broadcast cleanup. Account owner/generation checks block late writes; playback is cleared even while in a Jam. Authentication-state cleanup removes legacy caches on guest startup and account switches. | Account keys disappear and late writes reject; guest history and general preferences are retained. Full browser multi-tab behavior remains unverified. |
| F11 | Shared display-name validation requires visible, well-formed text and rejects control-only names. Legacy account/playlist labels receive safe fallbacks. | Invisible/control-only signup and playlist names reject with 400. |
| F12 | Session lookups prune expired records and cap the cache at 1,000 entries, including concurrent insertion. | After 10,000 synthetic lookups and TTL expiry, no expired entries remain and the cap holds. |
| F13 | Signup truncates by whole Unicode code points within the existing UTF-16 length bound. | The previously failing odd-offset emoji username successfully reaches 201. |

## Checks

```sh
node docs/qa/security-audit/run.cjs /tmp/heykasa-web-regressions.json --verify-fixes
python3 docs/qa/security-audit/run_media.py /tmp/heykasa-media-regressions.json --verify-fixes
npm run check
npm run check:desktop-contract
```

The local regression run passed **2,705 cases** (2,612 web/native, 93 media), with zero attempted outbound web fetches and zero harness exceptions. The remaining 62 web 503s are intentional unconfigured-provider fixtures; none of the four baseline request-specific 500s recur. Local lint, type checks, production build, contract generation, native syntax and Python compilation passed. Local dependencies still differ from declared deployment versions; the new Security Regression workflow installs Node 22, Python 3.12 and the repository's declared dependencies to repeat these checks in CI.

The baseline evidence JSON files remain historical records, not post-fix results. `--verify-fixes` makes the harness fail when a remediation regresses rather than merely recording observations.

## Limits and compatibility

- Oversized/malformed requests now reject earlier. Covers with fake MIME labels, corrupt data, excessive dimensions or animation are rejected instead of being saved. Valid new covers are stored as normalized JPEGs.
- Ordinary logout removes account-specific local data while preserving guest history and cosmetic preferences. An authenticated user's current history cache is still browser-readable; this change addresses retention after logout, not encryption against the signed-in user's DevTools.
- Stable/beta desktop signing checks are unchanged. Updating the native logger requires a new desktop installer; web controls require deploying this PR. No production deployment, merge, signed release publication or real Windows upgrade has been performed.
- Pinned-runtime CI, an interactive browser, two-user authorization checks and a clean Windows VM remain required before release approval. The baseline's deliberate local media-file truncation observation remains a separate stream-corruption hardening item; no remote mutation capability was demonstrated.
