import assert from "node:assert/strict";
import test from "node:test";
import {
  FOLLOW_HINT_ID,
  WATCHING_ID,
  buildNotificationItems,
  mergeSeenNotificationIds,
  releaseNotificationId,
  sanitizeNotificationIds,
} from "../src/utils/accountNotifications.mjs";
import { collapseRelatedReleases, followedArtistsForReleases } from "../src/utils/followedArtistsList.mjs";

const now = Date.parse("2026-09-19T12:00:00.000Z");

test("guests get a sign-in prompt and product updates, not artist releases", () => {
  const result = buildNotificationItems({
    authenticated: false,
    releases: [{ id: "abcdefghijk", title: "Secret", channel: "Hidden", publishedAt: "2026-09-18T00:00:00.000Z" }],
    now,
  });
  assert.equal(result.items.some((item) => item.type === "release"), false);
  assert.equal(result.items.some((item) => item.id === "account:sign-in"), true);
  assert.equal(result.items.some((item) => item.type === "product"), true);
  assert.equal(result.unreadCount >= 1, true);
});

test("registered users with no follows get a useful follow hint", () => {
  const result = buildNotificationItems({
    authenticated: true,
    followedCount: 0,
    seenIds: [],
    now,
  });
  const hint = result.items.find((item) => item.id === FOLLOW_HINT_ID);
  assert.equal(hint?.unread, true);
  assert.equal(hint?.href, "/search");
});

test("followed releases are unread only after follow time and inside the recent window", () => {
  const followTimes = new Map([["UCaaaaaaaaaaaaaaaaaaaaaa", Date.parse("2026-09-10T00:00:00.000Z")]]);
  const result = buildNotificationItems({
    authenticated: true,
    followedCount: 1,
    followedAtByChannel: followTimes,
    seenIds: [],
    now,
    releases: [
      {
        id: "newrelease01",
        title: "Fresh single",
        channel: "Nova",
        channelId: "UCaaaaaaaaaaaaaaaaaaaaaa",
        publishedAt: "2026-09-18T00:00:00.000Z",
      },
      {
        id: "oldrelease01",
        title: "Before they followed",
        channel: "Nova",
        channelId: "UCaaaaaaaaaaaaaaaaaaaaaa",
        publishedAt: "2026-09-01T00:00:00.000Z",
      },
    ],
  });
  const fresh = result.items.find((item) => item.id === releaseNotificationId("newrelease01"));
  const stale = result.items.find((item) => item.id === releaseNotificationId("oldrelease01"));
  assert.equal(fresh?.unread, true);
  assert.equal(stale?.unread, false);
});

test("registered users with follows and no recent releases get a watching status", () => {
  const result = buildNotificationItems({
    authenticated: true,
    followedCount: 3,
    releases: [],
    seenIds: [],
    now,
  });
  assert.equal(result.items.some((item) => item.id === FOLLOW_HINT_ID), false);
  assert.equal(result.items.some((item) => item.id === WATCHING_ID), true);
});

test("related uploads of the same song collapse to one release", () => {
  const items = collapseRelatedReleases([
    { id: "aaaaaaaaaaa", channelId: "UCaaaaaaaaaaaaaaaaaaaaaa", title: "LITETELE (OUT NOW) ft Belly" },
    { id: "bbbbbbbbbbb", channelId: "UCaaaaaaaaaaaaaaaaaaaaaa", title: "LITETELE (Official Music Video)" },
    { id: "ccccccccccc", channelId: "UCbbbbbbbbbbbbbbbbbbbbbb", title: "Different song" },
  ]);
  assert.equal(items.length, 2);
  assert.equal(items[0].id, "aaaaaaaaaaa");
  assert.equal(items[1].id, "ccccccccccc");
});

test("followed artist lists merge name-only follows with channel metadata", () => {
  const artists = followedArtistsForReleases({
    followedArtists: ["Nova", "Legacy"],
    followedArtistsMeta: [
      { name: "Nova", channelId: "UCaaaaaaaaaaaaaaaaaaaaaa", thumbnail: "https://img.test/n.jpg" },
    ],
  });
  assert.equal(artists.length, 2);
  assert.equal(artists.find((artist) => artist.name === "Nova")?.channelId, "UCaaaaaaaaaaaaaaaaaaaaaa");
  assert.equal(artists.find((artist) => artist.name === "Legacy")?.channelId, "");
});

test("seen ids mark notifications read and reject unsafe values", () => {
  assert.deepEqual(sanitizeNotificationIds(["release:ok", "../evil", "release:ok", 12]), ["release:ok"]);
  assert.deepEqual(
    mergeSeenNotificationIds(["product:privacy-v1"], ["release:abcdefghijk"]),
    ["product:privacy-v1", "release:abcdefghijk"],
  );
});
