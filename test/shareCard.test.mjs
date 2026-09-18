import assert from "node:assert/strict";
import test from "node:test";
import {
  LISTEN_ON_HEYKASA,
  kasaShareMetadata,
  playlistEmbedSnippet,
  playlistListenUrl,
  privateShareMetadata,
  shareArtUrl,
  youtubeShareArt,
} from "../src/utils/shareCard.mjs";
import { SITE_NAME, SITE_URL, SOCIAL_IMAGE, absoluteUrl } from "../src/utils/siteConfig.js";

test("share cards stay on HeyKasa with honest title, art, and listen copy", () => {
  const metadata = kasaShareMetadata({
    title: "Late night mix",
    path: "/library/playlist/64b000000000000000000001",
    image: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg",
  });
  const blob = JSON.stringify(metadata);
  assert.equal(metadata.title, "Late night mix");
  assert.equal(metadata.description, LISTEN_ON_HEYKASA);
  assert.equal(metadata.openGraph.description, LISTEN_ON_HEYKASA);
  assert.equal(metadata.openGraph.siteName, SITE_NAME);
  assert.equal(metadata.openGraph.type, "website");
  assert.equal(metadata.openGraph.url, `${SITE_URL}/library/playlist/64b000000000000000000001`);
  assert.equal(metadata.openGraph.images[0].url, "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg");
  assert.equal(metadata.twitter.card, "summary_large_image");
  assert.equal(blob.includes("youtube.com/watch"), false);
  assert.equal(blob.includes("youtu.be"), false);
  assert.equal(metadata.openGraph.video, undefined);
  assert.equal(metadata.openGraph.audio, undefined);
  assert.equal(blob.toLowerCase().includes("autoplay"), false);
});

test("share art rejects data URLs, raw YouTube watch links, and off-site images", () => {
  assert.equal(youtubeShareArt("abcdefghijk"), "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg");
  assert.equal(shareArtUrl("data:image/png;base64,abc"), absoluteUrl(SOCIAL_IMAGE));
  assert.equal(shareArtUrl("https://youtube.com/watch?v=abcdefghijk"), absoluteUrl(SOCIAL_IMAGE));
  assert.equal(shareArtUrl("https://evil.example/art.png"), absoluteUrl(SOCIAL_IMAGE));
  assert.equal(shareArtUrl("/haykasa-og.png"), absoluteUrl(SOCIAL_IMAGE));
});

test("private playlist cards do not leak titles", () => {
  const metadata = privateShareMetadata();
  assert.equal(metadata.title, SITE_NAME);
  assert.equal(metadata.robots.index, false);
  assert.equal(metadata.openGraph.url, `${SITE_URL}/`);
});

test("embed snippets open playback on haykasa.vercel.app without autoplay", () => {
  const snippet = playlistEmbedSnippet("64b000000000000000000001");
  assert.match(snippet, /^<iframe /);
  assert.equal(snippet.includes("https://haykasa.vercel.app/embed/playlist/64b000000000000000000001"), true);
  assert.equal(snippet.includes("autoplay"), false);
  assert.equal(snippet.includes("youtube.com"), false);
  assert.equal(snippet.includes("sandbox="), true);
  assert.equal(playlistListenUrl("64b000000000000000000001"), "https://haykasa.vercel.app/library/playlist/64b000000000000000000001");
});
