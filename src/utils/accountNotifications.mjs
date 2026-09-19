export const PRODUCT_NOTIFICATIONS = [
  {
    id: "product:windows-installer-v1",
    title: "HayKasa for Windows",
    body: "Install the desktop app from Settings for Discord presence and a one-click Windows setup.",
    href: "/settings",
    createdAt: "2026-09-19T00:00:00.000Z",
  },
  {
    id: "product:privacy-v1",
    title: "Privacy Policy update",
    body: "We updated how HayKasa describes the data we keep for your account and playback.",
    href: "/privacy",
    createdAt: "2026-09-01T00:00:00.000Z",
  },
];

export const FOLLOW_HINT_ID = "account:follow-artists";
export const WATCHING_ID = "account:watching-artists";
export const FOLLOWS_CHANGED_EVENT = "heykasa:follows-changed";
export const UNREAD_RELEASE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
export const NOTIFICATION_ID = /^[A-Za-z0-9:._-]{1,80}$/;

export function releaseNotificationId(videoId) {
  return `release:${videoId}`;
}

export function sanitizeNotificationIds(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const ids = [];
  for (const value of values) {
    const id = typeof value === "string" ? value.trim() : "";
    if (!NOTIFICATION_ID.test(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= 50) break;
  }
  return ids;
}

export function mergeSeenNotificationIds(existing, incoming) {
  const seen = new Set();
  const merged = [];
  for (const id of [...(Array.isArray(existing) ? existing : []), ...sanitizeNotificationIds(incoming)]) {
    if (!NOTIFICATION_ID.test(id) || seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }
  return merged.slice(-200);
}

function followedAtMs(artist) {
  if (!artist?.followedAt) return null;
  const value = artist.followedAt instanceof Date ? artist.followedAt.getTime() : Date.parse(artist.followedAt);
  return Number.isFinite(value) ? value : null;
}

export function followedAtByChannel(userData) {
  const map = new Map();
  const meta = Array.isArray(userData?.followedArtistsMeta) ? userData.followedArtistsMeta : [];
  for (const artist of meta) {
    if (!artist?.channelId) continue;
    const at = followedAtMs(artist);
    if (at) map.set(artist.channelId, at);
  }
  return map;
}

export function buildNotificationItems({
  authenticated = false,
  releases = [],
  followedCount = 0,
  seenIds = [],
  followedAtByChannel: followTimes = new Map(),
  now = Date.now(),
} = {}) {
  const seen = new Set(Array.isArray(seenIds) ? seenIds : []);
  const items = [];

  if (authenticated && followedCount === 0) {
    items.push({
      id: FOLLOW_HINT_ID,
      type: "follow",
      title: "Follow artists you like",
      body: "HayKasa will tell you here when they drop a new song.",
      href: "/search",
      createdAt: new Date(now).toISOString(),
      unread: !seen.has(FOLLOW_HINT_ID),
      image: "",
      playable: null,
    });
  }

  if (authenticated) {
    for (const release of releases) {
      const published = Date.parse(release?.publishedAt || "");
      if (!Number.isFinite(published) || !release?.id) continue;
      const id = releaseNotificationId(release.id);
      const followTime = followTimes.get(release.channelId) || 0;
      const unreadCutoff = now - UNREAD_RELEASE_WINDOW_MS;
      const unread = !seen.has(id)
        && published >= unreadCutoff
        && published >= followTime;
      items.push({
        id,
        type: "release",
        title: release.channel || "Followed artist",
        body: release.title || "New release",
        href: release.channelId ? `/artist/${encodeURIComponent(release.channelId)}` : "/following",
        createdAt: release.publishedAt,
        unread,
        image: release.thumbnail || release.artistThumbnail || "",
        playable: {
          id: release.id,
          title: release.title || "",
          channel: release.channel || "",
          channelId: release.channelId || "",
          thumbnail: release.thumbnail || "",
          seedQuery: release.seedQuery || release.channel || "",
          genre: release.genre || release.channel || "",
        },
      });
    }

    if (followedCount > 0 && !releases.some((release) => release?.id)) {
      items.push({
        id: WATCHING_ID,
        type: "status",
        title: "Watching your artists",
        body: "No new songs in the last few weeks. We'll alert you here when they drop something.",
        href: "/following",
        createdAt: new Date(now).toISOString(),
        unread: false,
        image: "",
        playable: null,
      });
    }
  } else {
    items.push({
      id: "account:sign-in",
      type: "account",
      title: "Sign in for release alerts",
      body: "Registered accounts get a notification when artists you follow drop new music.",
      href: "/login",
      createdAt: new Date(now).toISOString(),
      unread: false,
      image: "",
      playable: null,
    });
  }

  for (const product of PRODUCT_NOTIFICATIONS) {
    items.push({
      ...product,
      type: "product",
      unread: !seen.has(product.id),
      image: "",
      playable: null,
    });
  }

  items.sort((left, right) => {
    if (left.unread !== right.unread) return left.unread ? -1 : 1;
    return Date.parse(right.createdAt || 0) - Date.parse(left.createdAt || 0);
  });

  return {
    items,
    unreadCount: items.filter((item) => item.unread).length,
  };
}
