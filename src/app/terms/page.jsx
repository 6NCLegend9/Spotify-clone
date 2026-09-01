import Link from "next/link";
import { ORG_CONTACT_EMAIL, SITE_NAME, SITE_URL } from "@/utils/siteConfig";

export const metadata = {
  title: "Terms of Service",
  description: `Read the terms that apply when you use or create an account on ${SITE_NAME}.`,
  alternates: { canonical: `${SITE_URL}/terms` },
};

export default function TermsPage() {
  return (
    <main className="page max-w-4xl text-white">
      <article>
        <header className="border-b border-white/10 pb-6">
          <p className="eyebrow">Legal</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Terms of Service</h1>
          <p className="mt-3 text-sm text-[#9aa8b5]">Last updated: September 1, 2026</p>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-[#c9d4de]">
            These Terms of Service explain the agreement between you and {SITE_NAME} when you
            browse the service, create an account, search for music, play available media, or
            use library and personalization features.
          </p>
        </header>

        <section className="border-b border-white/10 py-8" aria-labelledby="acceptance-of-terms">
          <h2 id="acceptance-of-terms" className="text-2xl font-bold">1. Acceptance of Terms</h2>
          <p className="mt-4 text-sm leading-7 text-[#c9d4de]">
            By accessing or using {SITE_NAME}, you agree to these Terms, our{" "}
            <Link href="/privacy" className="text-[#00e6e6] underline underline-offset-4">Privacy Policy</Link>,
            and our <Link href="/dmca" className="text-[#00e6e6] underline underline-offset-4">DMCA policy</Link>.
            When you create an account, you confirm that the information you provide is accurate,
            that you are legally able to enter this agreement, and that you will keep your account
            credentials secure. If you create or use an account for someone else, you confirm you
            have permission to do so.
          </p>
          <p className="mt-4 text-sm leading-7 text-[#c9d4de]">
            Your acceptance takes effect when you first use the service or submit the account
            registration form, whichever happens first. If you do not agree with these Terms, do
            not create an account or use the service. We may update these Terms when the service,
            law, or security requirements change. Continued use after an updated version is posted
            means you accept the updated Terms.
          </p>
        </section>

        <section className="border-b border-white/10 py-8" aria-labelledby="description-of-service">
          <h2 id="description-of-service" className="text-2xl font-bold">2. Description of Service</h2>
          <p className="mt-4 text-sm leading-7 text-[#c9d4de]">
            {SITE_NAME} is a music discovery and listening service. It provides search, playback
            controls, artist and album pages, music recommendations, favorites, personal playlists,
            listening-history tools, genre and language preferences, lyrics where available, and
            related account settings. The service helps you find and organize music available from
            third-party media sources.
          </p>
          <p className="mt-4 text-sm leading-7 text-[#c9d4de]">
            {SITE_NAME} does not claim ownership of third-party music, videos, artwork, or metadata,
            and it does not upload or host those media files. Availability, metadata, embeds, and
            playback can change when a source changes or removes content. A download control, where
            available, does not grant you ownership or any additional rights in the underlying work;
            you remain responsible for respecting the rights holder&apos;s terms and applicable law.
          </p>
        </section>

        <section className="border-b border-white/10 py-8" aria-labelledby="user-conduct">
          <h2 id="user-conduct" className="text-2xl font-bold">3. User Conduct</h2>
          <p className="mt-4 text-sm leading-7 text-[#c9d4de]">
            You must not use the service for any illegal or unauthorized purpose. In particular,
            you must not:
          </p>
          <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-7 text-[#c9d4de]">
            <li>violate any applicable law, regulation, copyright, trademark, privacy right, or third-party term;</li>
            <li>copy, redistribute, sell, publicly perform, or make content available without the required permission;</li>
            <li>bypass access controls, rate limits, source restrictions, security features, or content protections;</li>
            <li>use bots, scrapers, scripts, or bulk requests to harvest data or interfere with the service;</li>
            <li>attempt to access another person&apos;s account, impersonate someone, share credentials, or create deceptive accounts;</li>
            <li>upload, transmit, or link to malware, harmful code, spam, or material that is unlawful or abusive; or</li>
            <li>artificially manipulate listening activity, search results, recommendations, or other service metrics.</li>
          </ul>
          <p className="mt-4 text-sm leading-7 text-[#c9d4de]">
            We may limit, suspend, or end access when we reasonably believe an account or request
            violates these Terms, creates a security risk, or harms the service, its users, or rights holders.
          </p>
        </section>

        <section className="border-b border-white/10 py-8" aria-labelledby="accounts-and-security">
          <h2 id="accounts-and-security" className="text-2xl font-bold">4. Accounts and Security</h2>
          <p className="mt-4 text-sm leading-7 text-[#c9d4de]">
            You are responsible for activity carried out through your account. Choose a strong password,
            do not share it, and notify us promptly if you believe your account has been accessed without
            permission. We may require email verification or additional security checks to protect accounts
            and prevent misuse.
          </p>
        </section>

        <section className="border-b border-white/10 py-8" aria-labelledby="third-party-content">
          <h2 id="third-party-content" className="text-2xl font-bold">5. Third-Party Content and Copyright</h2>
          <p className="mt-4 text-sm leading-7 text-[#c9d4de]">
            Third-party providers and rights holders retain their rights in the material displayed or
            played through the service. Their own terms, policies, and availability rules may apply.
            For copyright concerns or removal requests, follow our{" "}
            <Link href="/dmca" className="text-[#00e6e6] underline underline-offset-4">DMCA policy</Link>.
          </p>
        </section>

        <section className="border-b border-white/10 py-8" aria-labelledby="service-availability">
          <h2 id="service-availability" className="text-2xl font-bold">6. Availability and Changes</h2>
          <p className="mt-4 text-sm leading-7 text-[#c9d4de]">
            We may change, improve, pause, or discontinue features at any time. We do not guarantee that
            every track, feature, recommendation, or third-party integration will always be available,
            error-free, or suitable for every device. Use the service at your own discretion and keep a
            separate copy of any information you need to retain.
          </p>
        </section>

        <section className="py-8" aria-labelledby="contact-and-account-closure">
          <h2 id="contact-and-account-closure" className="text-2xl font-bold">7. Account Closure and Contact</h2>
          <p className="mt-4 text-sm leading-7 text-[#c9d4de]">
            You can request permanent deletion of your account and associated account data through the
            <Link href="/privacy" className="ml-1 text-[#00e6e6] underline underline-offset-4">Privacy Policy</Link>.
            For questions about these Terms, contact us at{" "}
            <a href={`mailto:${ORG_CONTACT_EMAIL}`} className="text-[#00e6e6] underline underline-offset-4">
              {ORG_CONTACT_EMAIL}
            </a>.
          </p>
        </section>
      </article>
    </main>
  );
}