# Search bar appearance and sizing — October 23, 2026

The user clarified that this request concerns appearance / sizing. Search results, suggestion fetching, routes, playback and account behavior stay in their existing flow.

## Requirements checklist

| Requirement | Status | Evidence / next step |
| --- | --- | --- |
| Instructions, skills and integration trace | Verified | No applicable AGENTS.md. Ponytail, React best practices and browser verification applied. Navbar renders the shared Searchbar; globals.css, KasaShell.module.css and search.module.css contribute styles. Searchbar delegates to existing router, API, cache and Redux handlers; no backend / storage / native bridge changes are needed for this visual fix. |
| Identify the visual defects before editing | Verified | Six compiled-browser contexts reproduce a solid outer-form background, a second 2 px rectangular input outline and a 16 px off-center clear icon. Phone fields are 44 px high with 44 px controls inside only 40 px of content height; back and search icons appear together. |
| One rounded field and one visible input focus treatment | Verified | All six browser contexts measure a transparent outer form with no shadow, no redundant input outline and a white field focus border. Keyboard Tab reaches Clear with a visible 2 px inset focus ring. |
| Consistent size and centered search / clear / back icons | Verified | Existing Lucide icons are 22 px; clear / browse / back controls are centered 44 px targets. Phone Back replaces the visible magnifier while keeping the input's accessible label. |
| Responsive layout and touch targets | Verified | 320 / 390 px phones, 768 px tablet, 1440 px desktop, 1181 px Windows identity and 802 × 345 px Android landscape identity passed. Field height is 48 px; 44 px clear controls fit inside its borders. Browse keeps its original breakpoint. |
| Preserve search interactions | Verified | Final docs/qa/search/browser.cjs passes desktop and mobile, covering Home-to-Search focus, suggestions, keyboard viewport, routes, recent searches, save / play actions, clear / dismiss, failures and overflow. 100-character queries retain their input and cause no page overflow in all six visual contexts. |
| Lint, types and production build | Verified | Final DISABLE_PWA=1 npm run check passed under Node 22.23.4 with zero lint warnings. git diff --check passed. |
| Update PR41 and inspect CI | Pending | Publication and current-head CI status are recorded in PR41's description after this source verification record; the PR remains draft. |
| Physical devices and Safari | Explicitly deferred | Browser identities and mobile viewports are simulated Chromium. No native installation or physical keyboard / phone test is claimed. |
| Preview deployment | Blocked | Vercel deployment dpl_Dvn7VkTCd3U3v559CZfZWtXbMfrr for the preceding icon commit ef4db29 failed pushing the media container image to vcr.vercel.com. This is a container-registry push denial; all its GitHub jobs, including both Android emulators, passed. Recheck deployment on the final search-bar commit. |

The visual fix removes the form-level backdrop and redundant input outline, retaining the field's focus border. It centers 22 px Lucide glyphs in 44 px controls and uses a 48 px field with a 44 px interior on phones as well as desktop. Mobile Back replaces the visible magnifier while suggestions are open; the input keeps its label. The existing Browse breakpoint and all search handlers remain unchanged.

Verification must include keyboard Tab reaching the clear button with a visible inset ring, long query text fitting the field, overflow at 320 px, and existing Home-to-Search focus / navigation / suggestions / save / play / clear / dismiss checks. Synthetic browser APIs prevent production account writes and external playback requests.

## Evidence and affected files

- src/app/globals.css: remove redundant outer-form decoration.
- src/components/Layout/KasaShell.module.css: shared field height, icon sizing, centering, touch targets and keyboard focus styles; preserve responsive visibility.
- src/components/Searchbar.jsx: presentation classes for the existing Back button / input label only. No search handler or request changes.
- src/components/Search/search.module.css: remove the obsolete smaller Back button rule.

Manual inspection used the compiled Next.js production build and system Chromium. The script /workspace/scratch/search-bar/inspect.cjs stores raw before / after screenshots, measurements and logs in that directory. Existing interaction tests used their unchanged synthetic fixtures. The final focused phone input grows from 212.8 px to 244 px at 390 px viewport width, and from 142.8 px to 174 px at 320 px width.

[Desktop before](search-bar/before-desktop.png) · [Desktop after](search-bar/after-desktop.png) · [Phone before](search-bar/before-phone.png) · [Phone after](search-bar/after-phone.png) · [Final measurements](search-bar/measurements.json)

These checks demonstrate shared renderer appearance and interaction under fixtures. Physical devices, Safari and a production deployment remain unverified; no native executable or APK was changed.
