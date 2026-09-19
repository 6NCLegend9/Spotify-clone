# HayKasa theme tokens

Product: HayKasa Music. Dark-only streaming shell. Fonts: Poppins (UI) + Righteous (display). Accent is electric cyan on deep navy.

## Compact token summary

### Color
| Token | Value |
| --- | --- |
| `--accent` / `accent` | `#00e6e6` |
| `--teal` / `teal` | `#64c9d7` |
| `--teal-mid` / `teal.mid` | `#22a6b3` |
| `--navy` / `navy` | `#000814` |
| `--navy-deep` / `navy.deep` | `#020813` |
| `--navy-surface` / `surface` / `navy.surface` | `#07121d` |
| `--navy-raised` / `navy.raised` | `#0b1722` |
| `--navy-panel` / `navy.panel` | `#101c28` |
| `--text` | `#f4f7fb` |
| `--muted` / `muted` | `#9aa8b5` |
| `--glass` | `rgba(7, 18, 29, 0.62)` |
| `--glass-strong` | `rgba(2, 8, 19, 0.78)` |
| `--hairline` | `rgba(255, 255, 255, 0.1)` |
| `--hairline-cyan` | `rgba(0, 230, 230, 0.22)` |
| selection | `rgba(0, 230, 230, 0.28)` on `#fff` |

High contrast a11y (`html[data-a11y-contrast="high"]`): accent `#6affff`, navy/surfaces `#000`, text `#fff`, muted `#f3f6f8`.

### Type
- Sans: `var(--font-poppins)`, Poppins, system-ui
- Display: `var(--font-righteous)`, Poppins
- Weights used: 400, 500, 600, 700, 800
- Focus ring: `3px solid var(--accent)`, offset `3px`

### Geometry & motion
- `--sidebar-w`: `16.25rem` (`--sidebar-collapsed-w`: `5.25rem`)
- `--topbar-h`: `64px`
- `--mobile-tabbar-h`: `max(3.75rem, 3rem + safe-area)`
- `--mobile-player-h`: `11.5rem`
- `--radius-lg`: `1.15rem`
- Tailwind `rounded-card`: `14px`
- Card radius in CSS: `16px`; buttons: pill `999px`; icon buttons: circle `2.75rem` (44px min)
- `--glow`: `0 0 40px rgba(0, 230, 230, 0.18)`
- `--inset-shine`: `inset 0 1px 0 rgba(255, 255, 255, 0.12)`
- Tailwind `shadow-glow`: `0 0 28px rgba(0, 230, 230, 0.16)`
- Tailwind `shadow-dock`: `0 -16px 48px rgba(0, 0, 0, 0.4)`
- Motion: `--motion-fast` 180ms, `--motion-ui` 220ms, ease `cubic-bezier(0.22, 1, 0.36, 1)`

### Breakpoints
`xs 475`, `sm 640`, `md 768`, `lg 1024`, `xl 1280`, `2xl 1536`

### Component recipes
- `.btn-primary`: height 2.75rem, pill, `#00e6e6` fill, `#001014` text, cyan glow
- `.btn-ghost`: pill, white 16% border, white 3% fill
- `.icon-btn`: 2.75rem circle, hairline border, hover cyan
- `.card` / `.library-tile`: 16px radius, panel fill, hover lift + cyan border + glow
- `.glass-panel`: cyan hairline, `--glass`, blur 12px
- `.search-field`: 3rem pill
- `.nav-link.is-active`: cyan tint + 3px left inset accent bar
- `.player-dock`: top cyan hairline, navy gradient, blur, upward shadow
- `.app-tab.is-active`: `#00e6e6` on `rgba(0, 230, 230, 0.08)`

## Raw: tailwind.config.js

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    screens: {
      xs: "475px",
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
    },
    extend: {
      colors: {
        accent: "#00e6e6",
        muted: "#9aa8b5",
        surface: "#07121d",
        teal: { DEFAULT: "#64c9d7", mid: "#22a6b3" },
        navy: {
          DEFAULT: "#000814",
          deep: "#020813",
          surface: "#07121d",
          raised: "#0b1722",
          panel: "#101c28",
        },
      },
      fontFamily: {
        sans: ["var(--font-poppins)", "Poppins", "system-ui", "sans-serif"],
        display: ["var(--font-righteous)", "var(--font-poppins)", "Poppins", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 28px rgba(0, 230, 230, 0.16)",
        dock: "0 -16px 48px rgba(0, 0, 0, 0.4)",
      },
      borderRadius: { card: "14px" },
    },
  },
  plugins: [],
};
```

## Raw: `:root` and key component CSS (from `src/app/globals.css`)

```css
:root {
  --accent: #00e6e6;
  --teal: #64c9d7;
  --teal-mid: #22a6b3;
  --navy: #000814;
  --navy-deep: #020813;
  --navy-surface: #07121d;
  --navy-raised: #0b1722;
  --navy-panel: #101c28;
  --sidebar-w: 16.25rem;
  --sidebar-collapsed-w: 5.25rem;
  --topbar-h: 64px;
  --text: #f4f7fb;
  --muted: #9aa8b5;
  --glass: rgba(7, 18, 29, 0.62);
  --hairline: rgba(255, 255, 255, 0.1);
  --hairline-cyan: rgba(0, 230, 230, 0.22);
  --glow: 0 0 40px rgba(0, 230, 230, 0.18);
  --inset-shine: inset 0 1px 0 rgba(255, 255, 255, 0.12);
  --radius-lg: 1.15rem;
}
html, body {
  height: 100%;
  overflow: hidden;
  font-family: var(--font-poppins), Poppins, system-ui, sans-serif;
  background: transparent;
  color: var(--text);
  color-scheme: dark;
}
```

Shell/player recipes live in `@layer components` of `src/app/globals.css` (`.app-shell`, `.app-navbar`, `.app-sidebar`, `.app-tabbar`, `.btn-primary`, `.icon-btn`, `.player-dock`). Player overlay CSS lives in `src/components/MusicPlayer/playerDock.module.css`.
