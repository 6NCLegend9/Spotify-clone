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

## Remaining risks

- Final managed Turbopack run passed all 12 desktop/mobile browser tests. Earlier
  attempts had unexplained process exits and an intermittent pre-hydration blank
  page also seen under webpack. A passing rerun is not proof those are eliminated.
- Real cold auth-session responses remain around 10 seconds locally. Backend
  module initialization and upstream latency need further isolated profiling.
- Root home recommendations still await their upstream result; quick access no
  longer waits, but personalized playlists and recommendations are not instant.
- Home session cache uses auth status instead of a specific account key. It needs
  a separate account-isolation correction, not an expanded private cache.
- Home and sidebar still issue separate playlist reads. Account-scoped shared
  request ownership and mutation invalidation need tests before deduplication.
- TagLib's browser bundle compiles under both compilers; actual tagged-file
  download execution was not exercised. Browser tests block YouTube decoding.
- Production first-load home JS remains 167kB. No bundle-size reduction, full
  vulnerability audit, load capacity certification or all-site optimization is claimed.