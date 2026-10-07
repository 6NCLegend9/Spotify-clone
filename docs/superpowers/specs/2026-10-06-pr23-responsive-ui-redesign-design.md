# PR23: HayKasa responsive interface redesign

Status: design and implementation plan approved after review corrections.
Baseline: local main at 8876c14 (merged PR22).
Planned GitHub branch: feat/pr23-responsive-ui-redesign — not yet created on GitHub at the review checkpoint. A local working branch with this name exists in this execution workspace.
Intended PR: next available number, preferably #23; no number is reserved or allocated by this work.

## Outcome and constraints

Redesign every existing website surface into a coherent, readable music interface that fits desktop browsers, small desktop windows, tablets, and phones in both orientations. Preserve existing capabilities and user preferences. Target a separate pull request, preferably #23; GitHub assigns the number.

Only presentation changes are authorized: CSS, layout wrappers, classes, visual copy where semantics stay equivalent, and accessible presentation markup. Keep handlers, props contracts, effects, providers, Redux actions/selectors, routes, requests, playback ownership, and persistence unchanged. Do not modify server routes, authentication behavior, search/radio algorithms, queue logic, responsive-policy utilities, Electron runtime, updater, databases, configuration, or dependencies. If a required outcome needs a behavior change, document it for separate authorization.

Test-only changes, deterministic fixtures, baseline/after screenshots, and design or PR documentation are authorized when they do not alter production behavior.

Shared web presentation changes may appear in the Electron renderer. Validate its 640x520 minimum window; do not change native code.

## Evidence and remaining uncertainty

Verified in source: Next.js 15 / React 18 / Tailwind 3; AppShell owns persistent player and navigation, persisted resizable side panels, and application providers. globals.css contains 3,935 lines; KasaShell.module.css contains a second shell skin imported by Navbar and scopes global layout through :has(.navbar). PlayerDock has separate pointer/width rules. responsivePolicy.mjs already covers phone landscape and compact touch. Existing Playwright projects cover Chromium, Firefox, WebKit, Pixel 7, and iPhone 15 emulation.

Multiple presentation layers create a maintenance and consistency risk; no runtime failure or performance regression is inferred from line counts alone. Visual baseline, keyboard checks, actual-device testing, and dependency availability remain unverified. No product code was modified during discovery.

## Design direction

Use a restrained dark music workspace with artwork as the dominant visual content and the existing user-selected accent for primary actions and selected states. The default theme uses opaque, distinct surfaces. Existing user-selected appearance settings remain authoritative. Customized backgrounds and effects may alter the default surface treatment, but foreground text, controls, focus indicators, and selected states must continue to meet the required contrast. Retain HayKasa branding and licensed existing artwork. Avoid new decorative backgrounds or animation. Preserve appearance settings; do not disable their behavior to obtain cleaner visuals.

Reuse semantic color variables for background, surface, raised surface, text, muted text, border, accent, and accent foreground. Use existing installed fonts with a readable system fallback; no new remote font dependency. Body text 16px, supporting text 14px, small metadata at least 12px. Spacing scale 4/8/12/16/24/32px; controls and surfaces use a small radius scale of 8/12/16px. Measure contrast rather than assuming accent text is readable.

Primary hierarchy: navigation and search; current page task; current playback; supporting queue/lyrics information. Stable alignment and content density take precedence over effects. Preserve existing loading, empty, error, offline, and disabled states, styled consistently without changing their triggers.

## Responsive layouts

Respect the current shared responsive policy. CSS rules must agree with it; do not introduce a second JS classification. Known presentation inconsistency: KasaShell.module.css enables its five-column shell at 1180px, while responsivePolicy.mjs defines desktop as 1181px and above or 768px and above with a fine pointer. Reconcile the shell CSS threshold at 1181px without modifying responsivePolicy.mjs, preserving the existing fine-pointer desktop path.

| Context | Presentation |
| --- | --- |
| Wide desktop, 1181px and above | Existing resizable library, flexible content, and now-playing panel; persistent bottom player. Panel widths must not squeeze essential content or controls. |
| Medium desktop with fine pointer | Library and flexible content; secondary panel uses its existing accessible entry points. Keep search, navigation history, volume, queue, and lyrics reachable. |
| Compact desktop, including 640x520 | Compact content and current narrow-window control paths; usable volume popover; no desktop-native changes. |
| Compact touch/tablet | Touch-sized controls, flexible cards, existing compact player and secondary-panel entry points. Do not force desktop controls based on width alone. |
| Phone portrait | One content column, existing bottom tabs, compact player when a track exists, existing expanded player. Reserve space and safe-area padding. |
| Phone landscape | Existing phone landscape policy; smaller header/artwork, scrollable expanded content, persistent reachable transport and dismiss controls. |

No invented navigation routes, new panel state, or new interaction model. A layout may reposition an existing control but must preserve its handler, accessible name, and state.

## Screen coverage

1. Shell: header/search, library sidebar, resizers, now-playing panel, footer, mobile tabs, overlays, and existing create hub.
2. Home/discovery: greeting, quick access, featured content, track/mix rails, filters, all existing editorial sections. Clarify hierarchy without altering item order, fetching, or queue seeds.
3. Search: browse and results, filters, cards/rows, loading, empty and error presentation. Keep open-versus-play behavior intact.
4. Library and collections: playlists, liked songs, recent history, following, album/artist/mix/YouTube-playlist details; retain virtualization and existing menu actions.
5. Playback: dock, volume, timeline, expanded/video/theater presentation, queue, lyrics, menus and drawers. Keep provider elements mounted, iframe dimensions/visibility contracts, transport, and mode handling intact.
6. Account/settings: login, signup, reset, resend and verification surfaces; existing settings, appearance, support diagnostics. Preserve field validation and submission behavior.
7. Additional surfaces: Jam, arcade, desktop handoff, public embed, legal/accessibility pages, not-found and global error/loading. Preserve independent embed boundaries and game behavior.

## Implementation boundaries

Test-only changes, deterministic fixtures, baseline/after screenshots, and design or PR documentation are authorized when they do not alter production behavior.

Map each existing selector and caller before replacing styling. Assign shell layout to its existing shared stylesheet, navbar-specific styles to its module, and player styles to their modules. Replace superseded rules where practical rather than appending another universal override. Do not delete global selectors until their consumers have been checked. Scope app styles away from embeds and unrelated special-purpose views.

Keep component order/DOM stability where provider mounting, focus, virtualization, or playback could depend on it. JSX edits are limited to presentation wrappers, classes and appropriate semantic attributes. Any diff that changes state/effects/events/data expressions fails the UI-only boundary review unless separately approved.

## Accessibility and interaction

Keyboard focus remains visible and unobscured. Preserve skip targets, focus traps, dialogs, separators, and existing accessible names. Use 44px or larger targets for essential touch controls. Do not hide essential actions behind hover. Normal text contrast >=4.5:1, large text and interface indicators >=3:1; selected state also has a non-color cue. Respect reduced motion and existing accessibility preferences. Test long track names, large text, 200% zoom, 320 CSS-pixel reflow, and right-to-left content.

## Acceptance and validation

Capture representative baseline and after screenshots; no UI defect is called reproduced without observing it. Check 320/360/390px phone widths, landscape 844x390, tablet 768/1024px with touch, desktop 1280/1440/1920px, and 640x520 minimum window. Test around 767/768 and 1180/1181 boundaries.

Run applicable existing unit and E2E suites, lint, typecheck and build. Add focused layout regressions for overlap/overflow and reachable controls; avoid screenshot-only tests that merely mirror CSS. Verify browsing a playlist, searching while audio plays, play/pause/next/previous, queue and lyrics access, video expand/collapse, volume, and existing modal dismissal still follow baseline behavior. Where provider/network/auth access is unavailable, label the flow blocked, not passing.

Check loading, errors, empty/offline states, long content, keyboard order, safe areas and browser console on touched flows. Emulation is not physical-device verification. Electron renderer emulation is not a native packaged-app test. Report these separately.

Review final diff for changes outside the presentation allowlist. Pull request description includes exact commit, screenshots, observed validation, failures/blockers, and UI-only boundary evidence. No production deployment or main merge is included. Rollback is reverting the isolated presentation commits.

## Review checkpoint

Design and implementation-plan reviews are complete following the user review of 2026-10-06. Execute sequentially with baseline evidence and targeted validation per surface; production changes remain UI-only.

## Owner-requested follow-up — October 7

Empty desktop playback chrome must collapse until a track is selected; phone navbar controls must align; built-in Liked Songs stays visible in library views; compact collection rows retain duration; known-unavailable songs remain dimmed and disabled rather than disappearing. These requests authorize the minimal client-side library inclusion, metadata placeholder and playback-eligibility changes required by those states. Provider mounting, backend, radio logic and persisted user playlist data remain outside this follow-up. See docs/qa/pr23-ui-redesign.md for validation and detection limits.
