# Performance review

Date: 2026-09-10. Role names and numbering come from `Copilot.md`.
This is one evidence-based engineering review using all 167 role perspectives,
not 167 independent specialist audits. No unsupported hardware, AI, cloud, or
security certification is implied.

## Implemented and measured

- Default development command: `npm run dev` now uses Turbopack. Production
  builds still use webpack. `npm run dev:webpack` is the fallback.
- Disabled PWA and bundle-analyzer plugins are no longer imported during dev.
- Turbopack browser aliases match the existing webpack Node-module fallbacks
  required by TagLib. No server-side Node APIs are replaced.
- Home history, playlists, and followed releases now start independently.
- Home quick access renders without waiting for recommendations. A browser test
  holds both history and recommendations pending and checks usable quick access
  plus independently started requests.
- A repeatable benchmark owns its temporary server and cleans it up without
  stopping the user's server. It reports status/timing, not response bodies.

Same-machine managed benchmark results, milliseconds:

| Request | Webpack | Turbopack |
| --- | ---: | ---: |
| First home response | 49504 | 16245 |
| Warm home response | 288 | 610 |
| First search response | 17864 | 2000 |
| Warm search response | 295 | 643 |
| First auth-session response | 13693 | 9748 |
| Warm auth-session response | 136 | 667 |

Turbopack improves compilation-heavy first requests here, not every warm request.
These are local development measurements, not production latency guarantees.
The webpack run used a fresh output directory; the final Turbopack run reused
its benchmark directory but recompiled routes after restart. Earlier fresh
Turbopack home requests took 17.6-25.4 seconds. This is not a controlled statistical
benchmark; filesystem cache, concurrent processes, and network conditions vary.
The user's original 85-second home request is contextual evidence, not the
denominator of a claimed speedup.

## Role dispositions

Every numbered role below was considered. Roles sharing a scope share the listed
disposition; irrelevant specialties did not trigger speculative infrastructure.

| Role IDs | Perspective and disposition |
| --- | --- |
| 1, 2, 3, 4, 5, 6 | Software/frontend/backend/full-stack/application/web: changed the dev build path and home request scheduling. |
| 7, 18 | Embedded/firmware: no firmware or device runtime exists in this repository; no change. |
| 8 | Mobile: browser regression covers 390px mobile and player resize checks down to 320px; physical-device testing remains. |
| 9, 10, 11, 12 | Cloud/platform/DevOps/SRE: preserved production compiler, isolated benchmark ports/output, retained fallback and cleanup. No cloud deployment changed. |
| 13 | Game developer: retained deferred arcade dependencies; no gameplay changes. |
| 14, 15 | Solutions/systems architecture: removed independent-request serialization, avoided arbitrary vendor chunk groups. |
| 16, 17, 19 | API/middleware/integration: maintained API contracts, cancellation and error handling; no private shared-response cache introduced. |
| 20, 21, 22, 23 | Testing/QA/automation/release: added stalled-network test, verified desktop/mobile suite, kept webpack rollback command. |
| 24, 25, 26 | Product management/technical product/ownership: prioritized usable home content and cold-start latency; no unrelated features. |
| 27, 28, 29, 30, 31 | Project/program/Scrum/Agile/delivery: delivered bounded changes with verification gates; remaining risks explicitly tracked below. |
| 32, 33, 34 | Data science/analysis/BI: measured cold and warm requests separately and disclosed warm-request regressions. |
| 35, 41, 44 | Data engineering/architecture/modeling: preserved schema and account boundaries; no data migration or denormalization. |
| 36, 37, 38, 39, 40, 45 | ML/AI/deep learning/NLP/computer vision/MLOps: no model inference pipeline is involved; no new AI dependency. |
| 42, 43 | Statistics/research: small non-controlled local sample; no percentile, significance, or universal speed claims. |
| 46, 47, 48 | UI/UX/product design: quick access remains usable during slow recommendations; existing visual design preserved. |
| 49, 54 | UX/user research: no user study performed; actual user logs supplied the problem evidence. |
| 50, 51, 52, 53 | Visual/interaction/motion/design technology: retained backgrounds, responsive controls and motion; synchronized test with hydration. |
| 55, 56 | Accessibility/information architecture: quick links preserve accessible names and keyboard navigation; no full accessibility audit claimed. |
| 57, 58, 59, 60 | Security analysis/engineering/architecture/AppSec: retained CSP, auth checks and production configuration; browser-only aliases do not replace server APIs. |
| 61, 62, 63 | Network security/penetration testing/ethical hacking: no firewall changes or penetration test performed. |
| 64, 65, 66, 67 | SOC/incident response/threat/compliance: record unexplained dev exits and fallback; no compliance attestation. |
| 68, 69, 70, 71 | IT support/systems/network/infrastructure: inspected memory and listener state; did not disable antivirus or alter machine policy. |
| 72, 73 | Cloud security/IAM: no cloud identity or permissions changes; account isolation retained. |
| 74, 75, 76, 77 | Hardware/systems/network architecture/data-center: inspected local resource pressure; no infrastructure sizing guarantee. |
| 78, 79, 80, 81, 82 | Electrical/robotics/FPGA/IoT/embedded hardware: no relevant hardware surface; no change. |
| 83, 84, 85, 86, 87, 88, 89, 90 | AI research/product/training/software/ethics/RPA/conversation/QA: deterministic tests suffice; no agent or model system added. |
| 91, 92, 93, 94 | DevOps/cloud architecture/development/operations: local dev workflow changed; deployed cloud behavior not benchmarked. |
| 95, 96 | Kubernetes/Docker: no container orchestration is required for this local problem; no change. |
| 97, 98, 99, 100 | Reliability/IaC/CI-CD/observability: managed benchmark lifecycle and preserved production build; no IaC changes or load-test claims. |
| 101, 102, 103 | Growth/technical marketing/digital analytics: no growth experiment; report measured engineering results only. |
| 104, 105 | SEO/marketing automation: preserved server metadata and crawlable content; no marketing scripts added. |
| 106, 107, 108, 109, 110, 111 | Solutions/sales/account/customer success/pre-sales/post-sales: documented commands, rollback and limitations; no unsupported performance promises. |
| 112, 113, 114, 115, 116 | Blockchain/contracts/quantum/Web3/crypto: no corresponding product surface; no change. |
| 117, 118 | Prompt/chatbot: role checklist used transparently; no chatbot or prompt-runtime changes. |
| 119, 120, 121, 122 | VR/AR/metaverse/spatial/digital twins: retained optional 3D feature boundaries; no XR product or simulation introduced. |
| 123, 124, 125, 126, 127 | Engineering leadership/CTO: prioritize verified latency bottlenecks over role-count-driven work. |
| 128, 129, 130, 131, 132 | Lead/principal/staff/distinguished/fellow: preserve APIs and production behavior, test compatibility, disclose remaining risks. |
| 133, 134, 135, 136, 137 | Development/platform/infrastructure/security/data leadership: bounded release scope; no auth/cache shortcuts to claim faster loads. |
| 138, 139, 140, 141, 142, 143 | QA analysis/quality/automation/manual/lead/management: browser and unit checks; manual physical-device/download tests remain. |
| 144, 145 | Release/build engineering: production build preserved, benchmark directories ignored, fallback available. |
| 146, 147, 148 | Performance/load/regression testing: measured route latency and delayed-network behavior; no concurrent production load test performed. |
| 149, 150, 151, 152, 153, 154 | Technical/IT/application/helpdesk/support/developer support: documented restart and fallback; kept the user's active server untouched. |
| 155, 156, 157 | Tech Ops/systems operations/support management: benchmark process cleanup and reproducible diagnostics. |
| 158, 159, 160, 161 | Technical writing/advocacy/DevRel/API documentation: supplied runbook and evidence; unchanged API contracts. |
| 162, 163, 164, 165, 166, 167 | Curriculum/content/learning/instruction/coding education: distinguish compile time, network latency, hydration and data waterfalls in the runbook. |

## Repeat and rollback

1. Stop the existing dev process and run `npm run dev`; its banner should show
   `(Turbopack)`. Existing processes do not change compiler when scripts change.
2. Run `npm run benchmark:dev` for route timings or
   `node scripts/benchmark-dev.mjs --browser` for timings plus browser tests.
3. Compare with `node scripts/benchmark-dev.mjs --webpack`. Do not run both
   benchmarks simultaneously. They use separate ignored build directories.
4. Use `npm run dev:webpack` if Turbopack or HMR misbehaves. Production remains
   `npm run build` followed by `npm start`.

## Account-security implementation follow-up

The first implementation phase now isolates home/history/sidebar/navigation data
by account, handles empty authoritative history, and rejects stale async results
after account changes. Library listing rechecks current playlist visibility;
responses use an explicit public field contract. Versioned immutable sessions
support password-reset revocation and a confirmed Sign out all devices action.

The dependency security update resolves Next.js/tooling to 15.5.25, updates
Nodemailer and vulnerable transitive packages, and adds a production audit gate.
See `PRODUCTION.md` for the required one-time login and override rationale.
These are the foundation for the remaining implementation described below.

## Remaining roadmap implementation

The subsequent pass implements the following local application work. The original
role matrix remains a perspective checklist, not 167 independently executed audits.
Environment-specific acceptance is listed separately from implemented code.

| Work package | Implemented | Remaining verification or decision |
| --- | --- | --- |
| W05 Measurement | Bounded redacted browser diagnostics, correlated server errors, optional session/provider timing, production benchmark and commit-linked CI report. | Real authenticated/provider baselines, field INP and justified numeric regression budgets. |
| W06 Playback/startup | Nonblank server-rendered persistence fallback, stable snapshot throttling, explicit native audio/context resume, engine-owned actions and interruption tests. | Physical phone/headset behavior, actual decoding, deeper measured engine decomposition. |
| W07 Privacy | Versioned complete account export, confirmed transactional deletion/reference cleanup, accurate policy and opt-in retention controls. | Staging transaction/backup recovery and provider log-retention configuration. |
| W08 Library writes | Bounded conditional writes for favourites/songs/history; desired-state client requests; transactional playlist creation/deletion/likes; account-safe favourite cache and per-item rollback. | Live concurrent writers, schema compatibility inventory, actual index plans and connection sizing. |
| W09 Queue | Upcoming move/remove/clear, ten-second Undo, private playlist save, current-track preservation, shared expanded queue controls. | Two-device Jam synchronization under reconnect/conflict. |
| W10 Timer | 15/30/60-minute and end-of-track modes, refresh persistence, account/Jam cancellation and actual engine pause commands. | Exact OS-suspended expiry cannot be guaranteed by a website. |
| W11 Discovery | URL-backed result tabs/sort/duration, provider-backed continuation, duplicate removal/cancellation, seven-day snooze, feedback Undo and Settings restoration. | Live official-provider/fallback quota tests and wider multilingual relevance evaluation. |
| W12 Accessibility | Existing root tokens retained; new controls have semantic names, touch-sized targets, keyboard actions and responsive layouts. | Full-site contrast/zoom/RTL and VoiceOver/TalkBack audit; light theme remains a separate design decision. |
| W13 Insights | Explicit opt-in, bounded deduplicated playback observations, private-mode exclusion, retained 7/30-day summaries, clear/opt-out/export/delete controls. | Production retention operations and recommendation experiments; no model training or AI service introduced. |
| W14 Operations | Reproducible bug template, reviewed diagnostic download, API/rollout runbook, PWA registration tests, accurate public sitemap/search metadata and CI performance artifact. | Old-to-new PWA update, live OAuth/SMTP, load tests, backup restoration and deployment rollback drills. |

### Local verification

The final application build used Next.js 15.5.25 with PWA enabled and generated
all 50 routes. The current implementation passed 108 Node checks, including real
route handlers with isolated model/token fixtures, plus 42 Chromium desktop/mobile
browser tests. Lint and TypeScript checks passed. Browser cases cover queue edits,
timer engine pauses, URL search filters, feedback restoration, insight opt-in,
pending account-change responses and diagnostic downloads. The final review also
fixed late playlist-detail mutations and Smart Shuffle callbacks after unmount:
the previous account can no longer publish favourites or start queued playback
from a completed request. A delayed-mutation account-switch regression covers it.
These checks do not establish
physical-device support or real MongoDB transaction behavior.

`npm run benchmark:production` starts and cleans up its own server and writes
`artifacts/performance.json`. One local baseline run recorded:

| Surface | Observed time |
| --- | ---: |
| First home HTTP response in new process | 5296ms |
| Second home HTTP response | 60ms |
| Search HTTP response, first/repeat | 33ms / 9ms |
| Guest auth-session HTTP response, first/repeat | 28ms / 12ms |
| Desktop search visible shell, three samples | 419-649ms |
| Desktop library visible shell, three samples | 381-419ms |
| Mobile-width search visible shell, three samples | 347-450ms |
| Mobile-width library visible shell, three samples | 297-369ms |

HTTP measurements use real unauthenticated local requests. Browser measurements
mock APIs and use desktop Chromium at 1440px and 390px without CPU/network throttling.
Routing disables the HTTP cache; repeated loads are not warm HTTP-cache tests.
LCP/CLS/long-task values are snapshots at visible-shell readiness, not page-lifetime
field Web Vitals. Script bytes are encoded body sizes, not necessarily transferred
bytes. There are only three samples per route/viewport; no percentile or universal
speedup is claimed. The first home response still includes substantial startup
cost. The build reports 172kB first-load home JS and 106kB shared JS; this is not a
bundle-size reduction. See `PRODUCTION.md` for repeat commands and rollout gates.

## Remaining risks

- Final managed Turbopack run passed all 12 desktop/mobile browser tests. Earlier
  attempts had unexplained process exits and an intermittent pre-hydration blank
  page also seen under webpack. A passing rerun is not proof those are eliminated.
- Real cold auth-session responses remain around 10 seconds locally. Backend
  module initialization and upstream latency need further isolated profiling.
- Root home recommendations still await their upstream result; quick access no
  longer waits, but personalized playlists and recommendations are not instant.
- Home cache ownership is account-specific. Conditional library writes and
  transaction-based relationship changes are implemented; live DB concurrency and
  broader multi-tab request coordination remain unverified.
- Home and sidebar still issue separate playlist reads. Account-scoped shared
  request ownership and mutation invalidation need tests before deduplication.
- TagLib's browser bundle compiles under both compilers; actual tagged-file
  download execution was not exercised. Browser tests block YouTube decoding.
- Production first-load home JS is now 172kB. No bundle-size reduction, full
  vulnerability audit, load capacity certification or all-site optimization is claimed.