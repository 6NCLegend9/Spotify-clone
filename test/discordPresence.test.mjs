import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  allowedDiscordRedirectUris,
  isDiscordPresenceConfigured,
  parseDiscordAccessToken,
  readDiscordClientId,
  resolveDiscordRedirectUri,
} from "../src/utils/discordOAuth.mjs";
import {
  buildDiscordActivity,
  clipPresenceText,
  httpsAssetUrl,
  presenceTrack,
  shouldPublishDiscordPresence,
} from "../src/utils/discordPresence.mjs";

test("clips presence strings and keeps https artwork only", () => {
  assert.equal(clipPresenceText("  Brand   New Dance  "), "Brand New Dance");
  assert.equal(clipPresenceText("x".repeat(130)).length, 128);
  assert.equal(httpsAssetUrl("https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg"), "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg");
  assert.equal(httpsAssetUrl("http://insecure.example/art.jpg"), "");
  assert.equal(httpsAssetUrl([{ url: "https://cdn.example/a.jpg" }]), "https://cdn.example/a.jpg");
});

test("builds a Discord Rich Presence activity from the current YouTube track", () => {
  const track = presenceTrack({
    youtubeVideo: {
      id: "abcdefghijk",
      title: "Eminem - Brand New Dance [Official Audio]",
      channel: "EminemMusic",
      thumbnail: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg",
      duration: 200,
    },
  });
  assert.equal(track.id, "abcdefghijk");
  assert.equal(shouldPublishDiscordPresence({ enabled: true, privateSession: false, track }), true);
  assert.equal(shouldPublishDiscordPresence({ enabled: true, privateSession: true, track }), false);
  assert.equal(shouldPublishDiscordPresence({ enabled: false, privateSession: false, track }), false);

  const activity = buildDiscordActivity({
    track,
    playing: true,
    startedAt: 1_700_000_000_000,
    siteName: "HeyKasa",
    siteUrl: "https://haykasa.vercel.app",
  });
  assert.equal(activity.type, 0);
  assert.equal(activity.details, track.title);
  assert.equal(activity.state, "EminemMusic");
  assert.equal(activity.timestamps.end, 1_700_000_000_000 + 200_000);
  assert.equal(activity.buttons[0].url, "https://haykasa.vercel.app");
  assert.equal(activity.buttons[1].url, "https://haykasa.vercel.app/open-desktop");
  assert.ok(activity.buttons[0].label.length <= 32);

  const paused = buildDiscordActivity({
    track,
    playing: false,
    startedAt: 1_700_000_000_000,
    siteName: "HeyKasa",
    siteUrl: "https://haykasa.vercel.app",
  });
  assert.equal("timestamps" in paused, false);
  assert.equal(paused.assets.small_text, "Paused");
});

test("a live Jam uses a join secret instead of buttons", () => {
  const track = presenceTrack({
    youtubeVideo: { id: "abcdefghijk", title: "Song", channel: "Artist", duration: 100 },
  });
  const activity = buildDiscordActivity({
    track,
    playing: true,
    startedAt: 1_700_000_000_000,
    siteName: "HeyKasa",
    siteUrl: "https://haykasa.vercel.app",
    jamCode: "ABC234",
    partySize: 3,
  });
  assert.equal("buttons" in activity, false);
  assert.deepEqual(activity.secrets, { join: "ABC234" });
  assert.equal(activity.party.id, "jam-ABC234");
  assert.deepEqual(activity.party.size, [3, 50]);
  assert.equal(activity.instance, true);
});

test("validates Discord app configuration and redirect origins", () => {
  assert.equal(readDiscordClientId({ NEXT_PUBLIC_DISCORD_CLIENT_ID: "123456789012345678" }), "123456789012345678");
  assert.equal(readDiscordClientId({ NEXT_PUBLIC_DISCORD_CLIENT_ID: "not-an-id" }), "");
  assert.equal(isDiscordPresenceConfigured({
    NEXT_PUBLIC_DISCORD_CLIENT_ID: "123456789012345678",
    DISCORD_CLIENT_SECRET: "short",
  }), false);
  assert.equal(isDiscordPresenceConfigured({
    NEXT_PUBLIC_DISCORD_CLIENT_ID: "123456789012345678",
    DISCORD_CLIENT_SECRET: "discord-client-secret",
  }), true);

  const local = allowedDiscordRedirectUris({ NODE_ENV: "development" });
  assert.ok(local.has("http://localhost:3003"));
  assert.equal(
    resolveDiscordRedirectUri("http://evil.example", { NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "https://haykasa.vercel.app" }),
    "https://haykasa.vercel.app",
  );
  assert.equal(
    parseDiscordAccessToken({ access_token: "discord-access-token-value", expires_in: 3600 }).accessToken,
    "discord-access-token-value",
  );
});


test("production Discord presence is owned by the native Desktop boundary", async () => {
  const [client, settings, nextConfig, bridgeReadme] = await Promise.all([
    readFile(new URL("../src/lib/discordPresenceClient.js", import.meta.url), "utf8"),
    readFile(new URL("../src/app/settings/page.jsx", import.meta.url), "utf8"),
    readFile(new URL("../next.config.js", import.meta.url), "utf8"),
    readFile(new URL("../desktop-bridge/README.md", import.meta.url), "utf8"),
  ]);

  assert.match(client, /localBrowserBridgeAllowed/);
  assert.match(client, /production browser must never probe 127\.0\.0\.1/);
  assert.doesNotMatch(settings, /\/api\/discord\/config/);
  assert.equal(existsSync(new URL("../src/app/api/discord/config/route.js", import.meta.url)), false);
  assert.match(nextConfig, /const discordBridgeSources = isProduction\s*\?\s*\[\]\s*:\s*\[/);
  assert.match(bridgeReadme, /development-only/i);
});
