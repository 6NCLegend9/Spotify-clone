import { isJamCode, normalizeJamCode } from "./jam.mjs";

const PLAYING_TYPE = 0;
const MAX_PRESENCE_TEXT = 128;
const MAX_BUTTON_LABEL = 32;
const MAX_PARTY = 50;

export function clipPresenceText(value, max = MAX_PRESENCE_TEXT) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

export function httpsAssetUrl(value) {
  if (typeof value === "string") {
    const url = value.trim();
    return /^https:\/\//i.test(url) ? url : "";
  }
  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index -= 1) {
      const found = httpsAssetUrl(value[index]);
      if (found) return found;
    }
    return "";
  }
  if (value && typeof value === "object") {
    return httpsAssetUrl(value.url || value.link || value.src || value.image);
  }
  return "";
}

export function presenceTrack(player = {}) {
  const video = player.youtubeVideo;
  if (video?.id) {
    const title = clipPresenceText(video.title || "Unknown track");
    const artist = clipPresenceText(video.channel || video.author || video.author_name || "HayKasa");
    return {
      id: String(video.id),
      title,
      artist,
      artwork: httpsAssetUrl(video.thumbnail),
      duration: Number(video.duration) || 0,
    };
  }

  const song = player.activeSong;
  if (song?.id) {
    return {
      id: String(song.id),
      title: clipPresenceText(song.name || song.title || "Unknown track"),
      artist: clipPresenceText(song.primaryArtists || song.subtitle || song.author || "HayKasa"),
      artwork: httpsAssetUrl(song.image || song.thumbnail),
      duration: Number(song.duration) || 0,
    };
  }

  return null;
}

export function shouldPublishDiscordPresence({ enabled, privateSession, track } = {}) {
  return enabled !== false && privateSession !== true && Boolean(track?.id && track.title);
}

export function buildDiscordActivity({
  track,
  playing = true,
  startedAt,
  siteName = "HayKasa",
  siteUrl = "",
  jamCode = "",
  partySize = 1,
} = {}) {
  if (!track?.id || !track.title) return null;

  const started = Number(startedAt);
  const duration = Number(track.duration) || 0;
  const timestamps = playing && Number.isFinite(started) && started > 0
    ? {
      start: Math.floor(started),
      ...(duration > 0 ? { end: Math.floor(started + duration * 1000) } : {}),
    }
    : undefined;

  const activity = {
    // Discord local RPC Rich Presence is most compatible with the standard
    // custom application activity type. Song and artist stay in details/state.
    type: PLAYING_TYPE,
    details: clipPresenceText(track.title),
    state: clipPresenceText(track.artist || siteName),
    ...(timestamps ? { timestamps } : {}),
    assets: {
      large_image: track.artwork || "logo",
      large_text: clipPresenceText(siteName),
      small_text: playing ? "Playing" : "Paused",
    },
  };

  const joinCode = isJamCode(jamCode) ? normalizeJamCode(jamCode) : "";
  if (joinCode) {
    const size = Math.max(1, Math.min(MAX_PARTY, Math.round(Number(partySize) || 1)));
    activity.party = { id: `jam-${joinCode}`, size: [size, MAX_PARTY] };
    activity.secrets = { join: joinCode };
    activity.instance = true;
    return activity;
  }

  const buttonUrl = httpsAssetUrl(siteUrl);
  if (buttonUrl) {
    const origin = buttonUrl.replace(/\/$/, "");
    activity.buttons = [
      { label: clipPresenceText(`Listen on ${siteName}`, MAX_BUTTON_LABEL), url: buttonUrl },
      { label: clipPresenceText("Open HayKasa", MAX_BUTTON_LABEL), url: `${origin}/open-desktop` },
    ];
  }

  return activity;
}
