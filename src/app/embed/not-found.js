import { SITE_URL, SITE_NAME } from "@/utils/siteConfig";
import { LISTEN_ON_HEYKASA } from "@/utils/shareCard.mjs";

export default function EmbedNotFound() {
  return (
    <main className="kasa-embed">
      <p className="kasa-embed-brand">{SITE_NAME}</p>
      <h1 className="kasa-embed-title">This playlist isn’t available</h1>
      <p className="kasa-embed-empty">Public playlists can be embedded. Private lists stay private.</p>
      <a className="kasa-embed-listen" href={SITE_URL} target="_blank" rel="noopener noreferrer">
        {LISTEN_ON_HEYKASA}
      </a>
    </main>
  );
}
