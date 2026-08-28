import { ObjectId } from "mongodb";
import { COLLECTIONS } from "../db/collections.js";

const systemPlaylistMetadata = {
  daily: { systemType: "DailyDiscoveries", name: "Daily picks", description: "Updated today" },
  "weekly-new": { systemType: "WeeklyNewDiscoveries", name: "New Discoveries", description: "Fresh picks for this week" },
  "weekly-yours": { systemType: "YourDiscoveries", name: "Your Discoveries", description: "Built around your taste this week" },
};

function normalizedKey(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

function addWeight(map, label, weight) {
  const key = normalizedKey(label);
  if (!key || !Number.isFinite(weight) || weight <= 0) return;
  const current = map.get(key) || { label: String(label).trim(), weight: 0 };
  current.weight += weight;
  map.set(key, current);
}

function mapWeight(map, label) {
  const maximum = Math.max(1, ...[...map.values()].map((entry) => entry.weight));
  return (map.get(normalizedKey(label))?.weight || 0) / maximum;
}

function topEntries(map, field) {
  return [...map.values()]
    .sort((left, right) => right.weight - left.weight || left.label.localeCompare(right.label))
    .slice(0, 8)
    .map((entry) => ({ [field]: entry.label, weight: Math.round(entry.weight * 1000) / 1000 }));
}

function searchTokens(queryText) {
  return String(queryText || "")
    .toLocaleLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2)
    .slice(0, 12);
}

function parseDate(value, fallback) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function isoWeekId(date) {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function resolveRecommendationWindow(value, now = new Date()) {
  if (value === "daily") return { type: "daily", windowId: now.toISOString().slice(0, 10) };
  if (value === "weekly-new") return { type: "weekly-new", windowId: isoWeekId(now) };
  if (value === "weekly-yours") return { type: "weekly-yours", windowId: isoWeekId(now) };
  return { type: "standard", windowId: "rolling" };
}

async function getTasteSignals(db, userId, now = new Date()) {
  const lookback = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30);
  const [likedTracks, searchEvents, listeningTracks, followedArtists] = await Promise.all([
    db.collection(COLLECTIONS.likes).aggregate([
      { $match: { userId } },
      { $lookup: { from: COLLECTIONS.tracks, localField: "trackId", foreignField: "_id", as: "track" } },
      { $unwind: "$track" },
      { $project: { "track.genres": 1, "track.artistName": 1 } },
    ]).toArray(),
    db.collection(COLLECTIONS.searchEvents).find({ userId }).sort({ createdAt: -1 }).limit(60).toArray(),
    db.collection(COLLECTIONS.listeningEvents).aggregate([
      { $match: { userId, playedAt: { $gte: lookback } } },
      { $lookup: { from: COLLECTIONS.tracks, localField: "trackId", foreignField: "_id", as: "track" } },
      { $unwind: "$track" },
      { $project: { playedAt: 1, "track.genres": 1, "track.artistName": 1 } },
      { $sort: { playedAt: -1 } },
      { $limit: 120 },
    ]).toArray(),
    db.collection(COLLECTIONS.followedArtists).aggregate([
      { $match: { userId } },
      { $lookup: { from: COLLECTIONS.artists, localField: "artistId", foreignField: "_id", as: "artist" } },
      { $unwind: "$artist" },
      { $project: { "artist.genres": 1, "artist.name": 1 } },
    ]).toArray(),
  ]);

  const signals = {
    likedGenres: new Map(),
    likedArtists: new Map(),
    searchGenres: new Map(),
    searchArtists: new Map(),
    recentGenres: new Map(),
    recentArtists: new Map(),
    searchTokens: new Set(),
  };

  for (const entry of likedTracks) {
    for (const genre of entry.track.genres || []) addWeight(signals.likedGenres, genre, 1);
    addWeight(signals.likedArtists, entry.track.artistName, 1);
  }
  for (const entry of followedArtists) {
    for (const genre of entry.artist.genres || []) addWeight(signals.likedGenres, genre, 0.75);
    addWeight(signals.likedArtists, entry.artist.name, 1.25);
  }
  for (const event of searchEvents) {
    for (const genre of event.matchedGenres || []) addWeight(signals.searchGenres, genre, 1);
    for (const artist of event.matchedArtists || []) addWeight(signals.searchArtists, artist, 1);
    for (const token of searchTokens(event.queryText)) signals.searchTokens.add(token);
  }
  for (const entry of listeningTracks) {
    const ageHours = Math.max(0, (now.getTime() - parseDate(entry.playedAt, now).getTime()) / 3600000);
    const recencyWeight = Math.exp(-ageHours / 24);
    for (const genre of entry.track.genres || []) addWeight(signals.recentGenres, genre, recencyWeight);
    addWeight(signals.recentArtists, entry.track.artistName, recencyWeight);
  }

  return signals;
}

function tasteProfileFromSignals(signals, now) {
  const combinedGenres = new Map(signals.likedGenres);
  const combinedArtists = new Map(signals.likedArtists);

  for (const entry of signals.searchGenres.values()) addWeight(combinedGenres, entry.label, entry.weight * 0.6);
  for (const entry of signals.recentGenres.values()) addWeight(combinedGenres, entry.label, entry.weight * 0.4);
  for (const entry of signals.searchArtists.values()) addWeight(combinedArtists, entry.label, entry.weight * 0.6);
  for (const entry of signals.recentArtists.values()) addWeight(combinedArtists, entry.label, entry.weight * 0.4);

  return {
    topGenres: topEntries(combinedGenres, "genre"),
    topArtists: topEntries(combinedArtists, "artistName"),
    lastUpdatedAt: now,
  };
}

export async function recomputeTasteProfile(db, userId, now = new Date()) {
  const signals = await getTasteSignals(db, userId, now);
  const tasteProfile = tasteProfileFromSignals(signals, now);
  await db.collection(COLLECTIONS.users).updateOne({ _id: userId }, { $set: { tasteProfile, updatedAt: now } });
  return { signals, tasteProfile };
}

export async function invalidateRecommendationCache(db, userId) {
  await db.collection(COLLECTIONS.recommendations).deleteMany({ userId });
}

function genreScore(track, signalMap) {
  return Math.min(1, (track.genres || []).reduce((score, genre) => score + mapWeight(signalMap, genre), 0));
}

function scoreTrack(track, signals, window, recentlyRecommendedIds) {
  const artist = mapWeight(signals.likedArtists, track.artistName);
  const liked = Math.min(1, genreScore(track, signals.likedGenres) * 0.6 + artist * 0.8);
  const searchCorpus = `${track.title || ""} ${track.artistName || ""} ${(track.genres || []).join(" ")}`.toLocaleLowerCase();
  const search = Math.min(1, genreScore(track, signals.searchGenres) * 0.5 + mapWeight(signals.searchArtists, track.artistName) * 0.8 + (Array.from(signals.searchTokens).some((token) => searchCorpus.includes(token)) ? 0.45 : 0));
  const recent = Math.min(1, genreScore(track, signals.recentGenres) * 0.6 + mapWeight(signals.recentArtists, track.artistName) * 0.8);
  const popularity = Math.max(0, Math.min(1, Number(track.popularity) / 100));
  const freshness = Math.max(0, Math.min(1, (Number(track.releaseYear) - 2021) / 6));
  const id = track._id.toString();

  if (window.type === "daily") return 0.5 * liked + 0.3 * search + 0.2 * recent + 0.05 * popularity - (recentlyRecommendedIds.has(id) ? 0.5 : 0);
  if (window.type === "weekly-new") return 0.6 * liked + 0.25 * search + 0.15 * recent + 0.05 * popularity + 0.18 * freshness - (recentlyRecommendedIds.has(id) ? 0.6 : 0);
  if (window.type === "weekly-yours") return 0.6 * liked + 0.25 * search + 0.15 * recent + 0.05 * popularity - (recentlyRecommendedIds.has(id) ? 0.6 : 0);
  return 0.45 * genreScore(track, signals.likedGenres) + 0.35 * artist + 0.15 * recent + 0.05 * popularity - (recentlyRecommendedIds.has(id) ? 0.25 : 0);
}

function reasonForTrack(track, signals) {
  if (mapWeight(signals.likedArtists, track.artistName) > 0) return `Because you like ${track.artistName}`;
  const matchingGenre = (track.genres || []).find((genre) => mapWeight(signals.likedGenres, genre) > 0);
  if (matchingGenre) return `Because you listen to ${matchingGenre}`;
  const searchCorpus = `${track.title || ""} ${track.artistName || ""} ${(track.genres || []).join(" ")}`.toLocaleLowerCase();
  const matchingSearch = Array.from(signals.searchTokens).find((token) => searchCorpus.includes(token));
  if (matchingSearch) return `Based on your searches for ${matchingSearch}`;
  return "Fresh picks similar to your taste";
}

async function loadTracksByIds(db, trackIds) {
  const ids = trackIds.map(String).filter(ObjectId.isValid);
  if (!ids.length) return [];
  const tracks = await db.collection(COLLECTIONS.tracks).find({ _id: { $in: ids.map((id) => new ObjectId(id)) } }).toArray();
  const trackById = new Map(tracks.map((track) => [track._id.toString(), track]));
  return ids.map((id) => trackById.get(id)).filter(Boolean);
}

async function loadCachedRecommendations(db, userId, window, limit, now) {
  const cache = await db.collection(COLLECTIONS.recommendations).findOne({ userId, windowType: window.type, windowId: window.windowId });
  if (!cache) return null;
  if (window.type === "standard" && now.getTime() - parseDate(cache.generatedAt, new Date(0)).getTime() >= 1000 * 60 * 30) return null;

  const tracks = await loadTracksByIds(db, cache.recommendedTrackIds || []);
  if (!tracks.length) return null;
  const playlist = ObjectId.isValid(cache.playlistId)
    ? await db.collection(COLLECTIONS.playlists).findOne({ _id: new ObjectId(cache.playlistId) })
    : null;
  return { tracks: tracks.slice(0, limit), reasonsByTrackId: cache.reasonsByTrackId || {}, playlist };
}

async function syncSystemPlaylist(db, userId, window, tracks, now) {
  const metadata = systemPlaylistMetadata[window.type];
  if (!metadata) return null;

  const playlists = db.collection(COLLECTIONS.playlists);
  let playlist = await playlists.findOne({ ownerId: userId, type: "system", systemType: metadata.systemType });
  const values = {
    name: metadata.name,
    description: metadata.description,
    isPublic: false,
    type: "system",
    systemType: metadata.systemType,
    coverUrl: tracks[0]?.coverUrl || "",
    systemWindowId: window.windowId,
    updatedAt: now,
  };

  if (!playlist) {
    const inserted = await playlists.insertOne({ ownerId: userId, ...values, createdAt: now });
    playlist = { _id: inserted.insertedId, ownerId: userId, ...values, createdAt: now };
  } else {
    await playlists.updateOne({ _id: playlist._id }, { $set: values });
    playlist = { ...playlist, ...values };
  }

  await db.collection(COLLECTIONS.playlistItems).deleteMany({ playlistId: playlist._id });
  if (tracks.length) {
    await db.collection(COLLECTIONS.playlistItems).insertMany(tracks.map((track, position) => ({
      playlistId: playlist._id,
      trackId: track._id,
      addedAt: now,
      position,
    })));
  }
  return playlist;
}

export async function getRecommendations(db, userId, window, limit) {
  const now = new Date();
  const cached = await loadCachedRecommendations(db, userId, window, limit, now);
  if (cached) return cached;

  const { signals } = await recomputeTasteProfile(db, userId, now);
  const [tracks, likes, history, heavyListening] = await Promise.all([
    db.collection(COLLECTIONS.tracks).find({}).limit(600).toArray(),
    db.collection(COLLECTIONS.likes).find({ userId }, { projection: { trackId: 1 } }).toArray(),
    db.collection(COLLECTIONS.recommendationHistory).find({ userId, recommendedAt: { $gte: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 7) } }, { projection: { trackId: 1 } }).toArray(),
    db.collection(COLLECTIONS.listeningEvents).aggregate([
      { $match: { userId, playedAt: { $gte: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 14) } } },
      { $group: { _id: "$trackId", plays: { $sum: 1 } } },
      { $match: { plays: { $gte: 3 } } },
    ]).toArray(),
  ]);
  const likedIds = new Set(likes.map((like) => like.trackId.toString()));
  const recentlyRecommendedIds = new Set(history.map((entry) => entry.trackId.toString()));
  const heavilyPlayedIds = new Set(heavyListening.map((entry) => entry._id.toString()));
  const eligibleTracks = tracks.filter((track) => {
    const id = track._id.toString();
    if (likedIds.has(id)) return false;
    return window.type !== "weekly-new" || !heavilyPlayedIds.has(id);
  });
  const selectedTracks = eligibleTracks
    .map((track) => ({ track, score: scoreTrack(track, signals, window, recentlyRecommendedIds) }))
    .sort((left, right) => right.score - left.score || left.track._id.toString().localeCompare(right.track._id.toString()))
    .slice(0, limit)
    .map((entry) => entry.track);
  const reasonsByTrackId = Object.fromEntries(selectedTracks.map((track) => [track._id.toString(), reasonForTrack(track, signals)]));
  const playlist = await syncSystemPlaylist(db, userId, window, selectedTracks, now);
  const cacheDocument = {
    userId,
    windowType: window.type,
    windowId: window.windowId,
    generatedAt: now,
    playlistId: playlist?._id || null,
    seedSignals: {
      likedTrackIdsSample: [...likedIds].slice(0, 20),
      topGenresSample: topEntries(signals.likedGenres, "genre"),
      topArtistsSample: topEntries(signals.likedArtists, "artistName"),
      recentSearchQueriesSample: Array.from(signals.searchTokens).slice(0, 20),
    },
    recommendedTrackIds: selectedTracks.map((track) => track._id.toString()),
    reasonsByTrackId,
  };
  await db.collection(COLLECTIONS.recommendations).updateOne(
    { userId, windowType: window.type, windowId: window.windowId },
    { $set: cacheDocument },
    { upsert: true },
  );
  if (selectedTracks.length) {
    await db.collection(COLLECTIONS.recommendationHistory).bulkWrite(selectedTracks.map((track) => ({
      updateOne: {
        filter: { userId, trackId: track._id },
        update: { $set: { recommendedAt: now, windowType: window.type } },
        upsert: true,
      },
    })));
  }

  return { tracks: selectedTracks, reasonsByTrackId, playlist };
}