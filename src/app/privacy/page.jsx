import DeleteAccountForm from "@/components/DeleteAccountForm";
import { ORG_CONTACT_EMAIL, SITE_NAME, SITE_URL } from "@/utils/siteConfig";

export const metadata = {
  title: "Privacy Policy",
  description: `Learn what information ${SITE_NAME} stores, how it is used, and how to delete it.`,
  alternates: { canonical: `${SITE_URL}/privacy` },
};

export default function PrivacyPage() {
  return (
    <main className="page max-w-4xl text-white">
      <article>
        <header className="border-b border-white/10 pb-6">
          <p className="eyebrow">Legal</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Privacy Policy</h1>
          <p className="mt-3 text-sm text-[#9aa8b5]">Last updated: September 10, 2026</p>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-[#c9d4de]">
            This policy explains the information {SITE_NAME} stores when you use the service,
            why it is used, and how you can request deletion of your account data.
          </p>
        </header>

        <section className="border-b border-white/10 py-8" aria-labelledby="information-we-collect">
          <h2 id="information-we-collect" className="text-2xl font-bold">1. Information We Collect</h2>
          <p className="mt-4 text-sm leading-7 text-[#c9d4de]">
            We collect information you provide to create and use an account, including your display
            name, email address, profile image, and a securely hashed password for password-based
            accounts. If you use Google to sign in, we receive the identity details that Google
            provides for authentication, such as your name, email address, and profile image.
          </p>
          <p className="mt-4 text-sm leading-7 text-[#c9d4de]">
            To provide library and personalization features, we store account activity you choose
            to create in the service. This can include favorite tracks and when they were added,
            listening history and completed plays, recent searches, skipped tracks, followed
            artists, tracks or playlists you marked as not interested, and tracks you snoozed.
          </p>
          <p className="mt-4 text-sm leading-7 text-[#c9d4de]">
            We also store the content and settings associated with your account: playlist names,
            tracks, dates added, visibility, pinned or shuffle preferences, invited collaborators,
            selected languages, genres and tags, explicit-content choices, playback and sound
            settings, data-saving choices, and feature settings such as lyrics or picture-in-picture.
            We maintain short-lived verification and password-reset tokens when you request those
            account actions. Authentication sessions are handled through signed session tokens.
          </p>
          <p className="mt-4 text-sm leading-7 text-[#c9d4de]">
            No third-party usage analytics script is loaded. Optional Listening insights in
            Settings records track identifiers, event identifiers, timestamps, playback outcomes,
            and observed playback seconds only after you enable it. Private sessions are excluded.
            Turning it off deletes saved observations; you can also clear them without disabling it.
            Summaries cover only observations collected after opt-in, not your entire listening history.
          </p>
          <p className="mt-4 text-sm leading-7 text-[#c9d4de]">
            Insights show up to 30 days and retain at most 1,000 observations. Older observations
            are removed when new observations are saved; inactive accounts may retain older entries
            until the next update, clearing, or account deletion. New snoozes expire after seven days.
            Earlier snoozes without expiry dates remain hidden until you restore them in Settings.
          </p>
          <p className="mt-4 text-sm leading-7 text-[#c9d4de]">
            Support diagnostics holds up to 100 redacted technical events in this page&apos;s memory.
            It does not include account identifiers, search terms, track titles, tokens, or request
            bodies, and is not sent to a reporting service. You can preview, download, or clear it.
            Reloading or changing accounts clears it. Server errors use correlation identifiers;
            optional server timing logs contain durations rather than personal request content.
          </p>
          <p className="mt-4 text-sm leading-7 text-[#c9d4de]">
            Our hosting and service providers may process standard technical request information,
            such as IP address, browser type, device information, request timing, and error or
            security logs, to deliver and protect the service.
          </p>
        </section>

        <section className="border-b border-white/10 py-8" aria-labelledby="how-we-use-information">
          <h2 id="how-we-use-information" className="text-2xl font-bold">2. How We Use Information</h2>
          <p className="mt-4 text-sm leading-7 text-[#c9d4de]">
            We use account information to authenticate you, maintain your profile, verify your email,
            respond to password-reset requests, and protect accounts from abuse. We use listening,
            search, favorite, playlist, genre, tag, language, and preference data to operate your
            library, continue your listening experience, and tailor discovery and recommendation features.
          </p>
          <p className="mt-4 text-sm leading-7 text-[#c9d4de]">
            We use technical and security information to troubleshoot failures, prevent fraud and
            excessive automated requests, enforce our Terms, and improve service reliability. We do
            not sell your personal information. We do not use your account activity to serve behaviorally
            targeted advertising through the application.
          </p>
        </section>

        <section className="border-b border-white/10 py-8" aria-labelledby="information-sharing">
          <h2 id="information-sharing" className="text-2xl font-bold">3. Information Sharing</h2>
          <p className="mt-4 text-sm leading-7 text-[#c9d4de]">
            We share only the information needed for the service to function: with infrastructure,
            authentication, email-delivery, and third-party media providers that support the
            features you use. Listening insights remain associated with your account in our database.
            Music searches and playback may send your request to a third-party source in order to
            return results or play media. Those providers operate under their own privacy terms.
          </p>
          <p className="mt-4 text-sm leading-7 text-[#c9d4de]">
            Public playlists may be visible to people using the service. Private playlists are intended
            for your account and any collaborators you add. We may also disclose information when required
            by law or when reasonably necessary to protect users, rights holders, or the service.
          </p>
        </section>

        <section className="border-b border-white/10 py-8" aria-labelledby="data-deletion-request-workflow">
          <h2 id="data-deletion-request-workflow" className="text-2xl font-bold">4. Data Deletion Request Workflow</h2>
          <p className="mt-4 text-sm leading-7 text-[#c9d4de]">
            While signed in, use the control below and type <strong>DELETE</strong> to confirm a permanent
            deletion request. The request deletes your account profile and password record, account data,
            favorites, history, searches, preferences, and playlists you own. It also removes your account
            from other playlists&apos; collaborator and like lists, removes references to your deleted
            playlists, and deletes personal genres and tags you created.
            Account-related data cached in this browser is cleared, and you will be signed out after the
            request succeeds. Signing in later with the same Google account creates a new empty account; it
            does not restore deleted data.
          </p>
          <div className="mt-5">
            <DeleteAccountForm />
          </div>
          <p className="mt-5 text-sm leading-7 text-[#c9d4de]">
            Deletion is permanent and cannot be undone. Residual copies may remain temporarily in routine
            backups or security logs until their normal retention cycle ends. To ask a privacy question or
            request help with deletion, email{" "}
            <a href={`mailto:${ORG_CONTACT_EMAIL}`} className="text-[#00e6e6] underline underline-offset-4">
              {ORG_CONTACT_EMAIL}
            </a>.
          </p>
        </section>

        <section className="py-8" aria-labelledby="policy-changes">
          <h2 id="policy-changes" className="text-2xl font-bold">5. Changes to This Policy</h2>
          <p className="mt-4 text-sm leading-7 text-[#c9d4de]">
            We may update this policy as our service or legal obligations change. The date above shows
            when it was last revised. Material changes will be reflected on this page.
          </p>
        </section>
      </article>
    </main>
  );
}