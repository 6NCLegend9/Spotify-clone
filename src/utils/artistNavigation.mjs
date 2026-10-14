import { cleanArtist, cleanTitle } from "./text.js";
import { normalizeRadioArtist } from "./radioSeed.mjs";

const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{20,24}$/;
const FEATURE_MARKER = /\s*\b(?:feat(?:uring)?|ft)\.?\s+/i;
const MEDIA_SEGMENT = /^(?:official\s+(?:music\s+)?(?:video|audio)|music\s+video|lyrics?|audio|visuali[sz]er)\b/i;

export function musicReleaseHref(albumId) {
  return typeof albumId === "string" && /^MPR[A-Za-z0-9_-]{3,125}$/.test(albumId)
    ? `/album/${encodeURIComponent(albumId)}`
    : "";
}

export function artistPageHref(channelId, name) {
  const id = typeof channelId === "string" ? channelId.trim() : "";
  const artist = cleanTitle(name).slice(0, 120);
  if (CHANNEL_ID_PATTERN.test(id)) {
    return `/artist/${encodeURIComponent(id)}${artist ? `?name=${encodeURIComponent(artist)}` : ""}`;
  }
  return artist ? `/artist?name=${encodeURIComponent(artist)}` : "";
}

export function normalizeArtistCredits(value) {
  const credits = [];
  for (const artist of Array.isArray(value) ? value : []) {
    const name = cleanArtist(typeof artist === "string" ? artist : artist?.name || artist?.title).slice(0, 120);
    if (!name) continue;
    const id = typeof artist?.channelId === "string" ? artist.channelId.trim() : typeof artist?.id === "string" ? artist.id.trim() : "";
    const credit = { name, ...(CHANNEL_ID_PATTERN.test(id) ? { channelId: id } : {}) };
    const existing = credits.find(item => item.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (existing) {
      if (!existing.channelId && credit.channelId) existing.channelId = credit.channelId;
    } else credits.push(credit);
    if (credits.length === 20) break;
  }
  return credits;
}

export function trackArtistCredits(track = {}) {
  const explicit = Array.isArray(track.artists) ? track.artists : [
    ...(Array.isArray(track.artists?.primary) ? track.artists.primary : []),
    ...(Array.isArray(track.artists?.featured) ? track.artists.featured : []),
    ...(Array.isArray(track.primaryArtists) ? track.primaryArtists : []),
  ];
  const individual = explicit.flatMap(artist => {
    const name = cleanArtist(typeof artist === "string" ? artist : artist?.name || artist?.title);
    const names = name.split(/\s*,\s*/).filter(Boolean);
    return names.length > 1 ? names.map(name => ({ name })) : [artist];
  });
  let credits = normalizeArtistCredits(individual);
  if (!credits.length) {
    const channel = cleanArtist(track.channel || track.channelTitle);
    const artist = cleanArtist(typeof track.artists === "string" ? track.artists : typeof track.artists?.primary === "string" ? track.artists.primary : typeof track.primaryArtists === "string" ? track.primaryArtists : track.artist);
    const title = cleanTitle(track.title || track.name);
    const parts = title.split(/\s+[-–—|]\s+/);
    // Title credits are a fallback, not a reason to split band names on '&' or 'and'.
    const prefix = parts.length > 1 && !MEDIA_SEGMENT.test(parts[1])
      ? (normalizeRadioArtist(parts[1]) === normalizeRadioArtist(channel) ? parts[1] : parts[0])
      : "";
    const main = artist || prefix || channel;
    const featured = parts.map(part => part.match(/\b(?:feat(?:uring)?|ft)\.?\s+([^()[\]]+)/i)?.[1]?.trim()).find(Boolean);
    const names = main.split(FEATURE_MARKER).flatMap(part => part.split(/\s*,\s*/));
    if (featured && !names.includes(featured)) names.push(...featured.split(/\s*,\s*/));
    credits = normalizeArtistCredits(names);
  }
  const channelKey = normalizeRadioArtist(track.channelTitle || track.channel);
  return credits.map(credit => !credit.channelId && channelKey && normalizeRadioArtist(credit.name) === channelKey && CHANNEL_ID_PATTERN.test(track.channelId)
    ? { ...credit, channelId: track.channelId }
    : credit);
}

export function artistChannelChoices(results, name) {
  const choices = [];
  for (const item of Array.isArray(results) ? results : []) {
    if (!CHANNEL_ID_PATTERN.test(item?.id) || !cleanTitle(item?.title) || choices.some(choice => choice.id === item.id)) continue;
    choices.push({ id: item.id, title: cleanTitle(item.title), thumbnail: typeof item.thumbnail === "string" ? item.thumbnail : "" });
  }
  const exact = choices.filter(item => normalizeRadioArtist(item.title) === normalizeRadioArtist(name));
  return exact.length ? exact : choices;
}

// Prefer the artist's own channel over a duplicate Topic/VEVO label. Only
// exact normalized identities qualify for automatic general-search navigation.
function artistIdentity(value) {
  return normalizeRadioArtist(cleanArtist(value).replace(/\$/g, "s").replace(/vevo$/i, ""))
    .replace(/\s+/g, "");
}

export function preferredArtistChannel(results, name) {
  const choices = artistChannelChoices(results, "");
  const identity = artistIdentity(name);
  if (!identity) return null;
  const matches = choices.filter(item => artistIdentity(item.title) === identity);
  matches.sort((a, b) => {
    const rank = item => cleanTitle(item.title).toLocaleLowerCase() === cleanTitle(name).toLocaleLowerCase()
      ? 3 : /[-–—]\s*Topic\s*$/i.test(item.title) ? 1 : 2;
    return rank(b) - rank(a);
  });
  return matches[0] || null;
}
