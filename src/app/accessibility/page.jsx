import AccessibilityControls from "@/components/AccessibilityControls";
import { ORG_CONTACT_EMAIL, SITE_NAME, SITE_URL } from "@/utils/siteConfig";

export const metadata = {
  title: "Accessibility Statement",
  description: `Accessibility features and support information for ${SITE_NAME}.`,
  alternates: { canonical: `${SITE_URL}/accessibility` },
};

export default function AccessibilityPage() {
  return (
    <main className="page max-w-4xl text-white">
      <article>
        <header className="border-b border-white/10 pb-6">
          <p className="eyebrow">Accessibility</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Accessibility Statement</h1>
          <p className="mt-3 text-sm text-[#9aa8b5]">Last updated: September 1, 2026</p>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-[#c9d4de]">
            {SITE_NAME} aims to make music discovery and listening usable for as many people as
            possible. This page explains the accessibility features currently available and lets
            you set display and motion preferences for this browser.
          </p>
        </header>

        <AccessibilityControls />

        <section className="border-b border-white/10 py-8" aria-labelledby="keyboard-navigation">
          <h2 id="keyboard-navigation" className="text-2xl font-bold">Keyboard navigation</h2>
          <p className="mt-4 text-sm leading-7 text-[#c9d4de]">
            Use the <strong>Tab</strong> key to move through links, controls, form fields, and
            playback actions. A visible focus indicator shows where you are. The first keyboard
            focusable item on a page is a Skip to main content link, allowing you to bypass
            navigation and move directly to the page content. Menus close with Escape. Form errors
            are announced as alerts and include a Try again action.
          </p>
        </section>

        <section className="border-b border-white/10 py-8" aria-labelledby="readable-errors">
          <h2 id="readable-errors" className="text-2xl font-bold">Readable errors</h2>
          <p className="mt-4 text-sm leading-7 text-[#c9d4de]">
            Sign-in and form errors use plain language instead of codes like CredentialsSignin.
            Failed logins include a Try again action and a link to reset your password.
          </p>
        </section>

        <section className="border-b border-white/10 py-8" aria-labelledby="visual-and-motion-support">
          <h2 id="visual-and-motion-support" className="text-2xl font-bold">Visual and motion support</h2>
          <p className="mt-4 text-sm leading-7 text-[#c9d4de]">
            The controls above can increase text size, increase color contrast, and reduce
            non-essential motion across the app. Your choices take effect immediately and are
            saved locally in this browser. HeyKasa also respects your operating system&apos;s
            <strong> prefers-reduced-motion</strong> setting, including for decorative animated
            backgrounds.
          </p>
        </section>

        <section className="border-b border-white/10 py-8" aria-labelledby="ongoing-work">
          <h2 id="ongoing-work" className="text-2xl font-bold">Ongoing work</h2>
          <p className="mt-4 text-sm leading-7 text-[#c9d4de]">
            We review interactive features as the service changes and work toward clear structure,
            keyboard operability, readable contrast, and useful labels for controls and media.
            Third-party media embeds and content returned by external sources may have accessibility
            behavior outside our direct control.
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
