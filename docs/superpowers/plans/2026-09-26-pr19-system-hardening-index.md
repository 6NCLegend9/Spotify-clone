# PR19 System Hardening Execution Index

**Spec:** `docs/superpowers/specs/2026-09-26-pr19-system-hardening-design.md`

Execute these plans in order unless a task is explicitly independent and touches no overlapping files:

1. `2026-09-26-pr19-desktop-release-runtime-hardening.md`
2. `2026-09-26-pr19-playback-responsive-hardening.md`
3. `2026-09-26-pr19-search-radio-rate-limits.md`
4. `2026-09-26-pr19-playlist-performance-cleanup.md`
5. `2026-09-26-pr19-final-integration-verification.md`

Cross-plan dependencies:

- Responsive policy changes land before final playlist/mobile verification.
- YouTubePlayer cleanup lands before search/radio caller updates if both touch `YouTubePlayer.jsx`.
- Desktop release/runtime tasks are independent from playlist/search work and may run in parallel only if the execution harness provides isolated worktrees.
- Final whole-branch verification runs only after the first four plans are complete.
- No task may merge PR #19, publish a stable Desktop release, or push directly to `main`.
