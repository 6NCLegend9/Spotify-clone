import AccessibilityControls from "@/components/AccessibilityControls";
import { ORG_CONTACT_EMAIL, SITE_NAME, SITE_URL } from "@/utils/siteConfig";

export const metadata = {
  title: "Accessibility Statement",
  description: `Accessibility features and support information for ${SITE_NAME}.`,
  alternates: { canonical: `${SITE_URL}/accessibility` },
};

function Key({ children }) {
  return (
    <kbd className="mx-0.5 inline-flex min-h-6 min-w-6 items-center justify-center rounded-md border border-white/15 bg-white/[0.07] px-1.5 font-mono text-[11px] font-semibold text-white">
      {children}
    </kbd>
  );
}

const KEYBOARD_GROUPS = [
  {
    title: "Move around the app",
    items: [
      {
        keys: ["Tab"],
        extra: (
          <>
            {" "}
            or <Key>Shift</Key> + <Key>Tab</Key>
          </>
        ),
        detail:
          "Move forward or backward through links, controls, form fields, and available playback actions.",
      },
      {
        keys: ["Tab"],
        detail:
          "The first focusable items are Skip to main content and Skip to player. Activate either to bypass navigation.",
      },
    ],
  },
  {
    title: "Search suggestions",
    items: [
      {
        keys: ["↑", "↓"],
        detail: "Move through matching genre suggestions.",
      },
      {
        keys: ["Home", "End"],
        detail: "Jump to the first or last genre suggestion.",
      },
      {
        keys: ["Enter"],
        detail: "Open the highlighted genre search.",
      },
      {
        keys: ["Esc"],
        detail: "Close search suggestions without leaving the search field.",
      },
    ],
  },
  {
    title: "Close overlays",
    items: [
      {
        keys: ["Esc"],
        detail: "Close the mobile navigation menu or search suggestions.",
      },
    ],
  },
  {
    title: "Playback",
    items: [
      {
        keys: ["Space"],
        detail: "Play or pause the current track.",
      },
      {
        keys: ["J", "L"],
        detail: "Seek backward or forward by 10 seconds.",
      },
      {
        keys: ["Shift", "N"],
        joined: true,
        detail: "Skip to the next track.",
      },
      {
        keys: ["M"],
        detail: "Mute or unmute.",
      },
      {
        keys: ["T"],
        detail: "Show or hide lyrics.",
      },
      {
        keys: ["F"],
        detail: "Open or close the expanded player.",
      },
      {
        keys: ["Esc"],
        detail: "Leave the expanded player.",
      },
    ],
  },
];

export default function AccessibilityPage() {
  return (
    <main className="page max-w-4xl text-white">
      <article>
        <header className="border-b border-white/10 pb-6">
          <p className="eyebrow">Accessibility</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Accessibility Statement</h1>
          <p className="mt-3 text-sm text-[#9aa8b5]">Last updated: September 3, 2026</p>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-[#c9d4de]">
            {SITE_NAME} aims to conform to the Web Content Accessibility Guidelines (WCAG) 2.1
            Level AA. This page explains the accessibility features currently available, where
            third-party media limits what we can guarantee, and lets you set display and motion
            preferences for this browser.
          </p>
        </header>

        <section className="border-b border-white/10 py-8" aria-labelledby="conformance-target">
          <h2 id="conformance-target" className="text-2xl font-bold">Conformance target</h2>
          <p className="mt-4 text-sm leading-7 text-[#c9d4de]">
            Our target is <strong>WCAG 2.1 Level AA</strong> (Level A plus Level AA). We do not
            require Level AAA for the whole site. Music playback uses YouTube embeds, so captions
            and audio description depend on what the uploader provided. We enable YouTube captions
            when they exist, and you can turn that request on or off in Settings.
          </p>
        </section>

        <AccessibilityControls />

        <section className="border-b border-white/10 py-8" aria-labelledby="keyboard-navigation">
          <h2 id="keyboard-navigation" className="text-2xl font-bold">Keyboard navigation</h2>
          <p className="mt-4 text-sm leading-7 text-[#c9d4de]">
            {SITE_NAME} is designed to be used with a keyboard. Shortcuts below work when you are
            not typing in a text field, except for search suggestions, which work inside the search box.
            Letter playback shortcuts can be turned off in Settings under Playback &amp; data so they
            do not conflict with assistive technology or another keyboard layout.
          </p>
          <div className="mt-6 space-y-6">
            {KEYBOARD_GROUPS.map((group) => (
              <div key={group.title}>
                <h3 className="text-sm font-semibold text-white">{group.title}</h3>
                <ul className="glass-panel mt-3 divide-y divide-white/10 overflow-hidden rounded-xl">
                  {group.items.map((item) => (
                    <li
                      key={`${group.title}-${item.detail}`}
                      className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                    >
                      <p className="text-sm leading-6 text-[#c9d4de]">{item.detail}</p>
                      <p className="shrink-0 text-left sm:text-right">
                        {item.keys.map((key, index) => (
                          <span key={`${key}-${index}`}>
                            {index > 0 ? (item.joined ? " + " : " ") : null}
                            <Key>{key}</Key>
                          </span>
                        ))}
                        {item.extra}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="border-b border-white/10 py-8" aria-labelledby="readable-errors">
          <h2 id="readable-errors" className="text-2xl font-bold">Readable errors</h2>
          <p className="mt-4 text-sm leading-7 text-[#c9d4de]">
            Errors shown by HeyKasa use plain language instead of exposing internal codes. Important
            errors are announced to assistive technology, and a Try again action is included when
            the failed operation can be safely repeated.
          </p>
        </section>

        <section className="border-b border-white/10 py-8" aria-labelledby="visual-and-motion-support">
          <h2 id="visual-and-motion-support" className="text-2xl font-bold">Visual and motion support</h2>
          <p className="mt-4 text-sm leading-7 text-[#c9d4de]">
            The controls above can increase text size, increase color contrast, and reduce
            non-essential motion across the app. Your choices take effect immediately and are
            saved locally when browser storage is available. HeyKasa also respects your operating system&apos;s
            <strong> prefers-reduced-motion</strong> setting even when the in-app toggle is off,
            including for decorative animated backgrounds.
          </p>
        </section>

        <section className="border-b border-white/10 py-8" aria-labelledby="ongoing-work">
          <h2 id="ongoing-work" className="text-2xl font-bold">Ongoing work</h2>
          <p className="mt-4 text-sm leading-7 text-[#c9d4de]">
            We review interactive features as the service changes and work toward WCAG 2.1 Level AA:
            clear structure, keyboard operability, readable contrast, and useful labels for controls
            and media. Third-party media embeds and content returned by external sources may have
            accessibility behavior outside our direct control, including missing captions or audio
            description on some YouTube videos.
          </p>
        </section>

        <section className="py-8" aria-labelledby="accessibility-feedback">
          <h2 id="accessibility-feedback" className="text-2xl font-bold">Accessibility feedback</h2>
          <p className="mt-4 text-sm leading-7 text-[#c9d4de]">
            If you encounter a barrier using {SITE_NAME}, tell us what you were trying to do, the
            page or feature involved, and the browser or assistive technology you use. Contact us at{" "}
            <a href={`mailto:${ORG_CONTACT_EMAIL}`} className="text-[#00e6e6] underline underline-offset-4">
              {ORG_CONTACT_EMAIL}
            </a>.
          </p>
        </section>
      </article>
    </main>
  );
}
