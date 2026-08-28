import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDatabase } from "../db/connection.js";
import { COLLECTIONS } from "../db/collections.js";
import { decodeCursor, encodeCursor, readPageSize } from "../lib/filterBuilder.js";
import { createRateLimiter } from "../lib/rateLimit.js";
import { serializeTrack } from "../lib/serializers.js";
import { requireUser } from "./auth.js";

const chartDefinitions = {
  daily: { title: "Daily Top Songs", windowMs: 86400000 },
  weekly: { title: "Weekly Top Songs", windowMs: 604800000 },
  trending: { title: "Trending Now", windowMs: 259200000 },
  "new-releases": { title: "New Releases", windowMs: 0 },
};
const radioSeedTypes = new Set(["track", "artist", "playlist"]);

function sameId(left, right) {
  return left?.toString() === right?.toString();
}

function readObjectId(value) {
  return typeof value === "string" && ObjectId.isValid(value) ? new ObjectId(value) : null;
}

function isoWeekId(date) {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function resolveChartWindow(type, now = new Date()) {
  const definition = chartDefinitions[type] || chartDefinitions.weekly;
  const windowId = type === "weekly" ? isoWeekId(now) : now.toISOString().slice(0, 10);
  return { type: chartDefinitions[type] ? type : "weekly", windowId, ...definition };
}

function stableNoise(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function daysSince(value, now) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? Math.max(0, (now.getTime() - timestamp) / 86400000) : 3650;
}

function chartScore(track, plays, window, now) {
  const popularity = Math.max(0, Math.min(1, Number(track.popularity) / 100));
  const freshness = Math.max(0, 1 - daysSince(track.releaseDate || track.createdAt, now) / 120);
  if (window.type === "new-releases") return freshness * 0.7 + popularity * 0.25 + stableNoise(track._id) * 0.05;
  if (window.type === "trending") return popularity * 0.45 + Math.min(1, plays / 18) * 0.45 + freshness * 0.1;
  return popularity * 0.55 + Math.min(1, plays / (window.type === "daily" ? 8 : 28)) * 0.4 + freshness * 0.05;
}

async function loadTracksByIds(db, trackIds) {
  const objectIds = trackIds.map((trackId) => readObjectId(String(trackId))).filter(Boolean);
  if (!objectIds.length) return [];
  const tracks = await db.collection(COLLECTIONS.tracks).find({ _id: { $in: objectIds } }).toArray();
  const trackById = new Map(tracks.map((track) => [track._id.toString(), track]));
  return trackIds.map((trackId) => trackById.get(String(trackId))).filter(Boolean);
}

async function getChart(db, window, limit) {
  const cached = await db.collection(COLLECTIONS.chartSnapshots).findOne({ windowType: window.type, windowId: window.windowId });
  if (cached) {
    const tracks = await loadTracksByIds(db, cached.trackIds || []);
    if (tracks.length) return { title: cached.title, generatedAt: cached.generatedAt, tracks: tracks.slice(0, limit) };
  }

  const now = new Date();
  const eventFilter = window.windowMs ? { playedAt: { $gte: new Date(now.getTime() - window.windowMs) } } : {};
  const [playRows, tracks] = await Promise.all([
    db.collection(COLLECTIONS.listeningEvents).aggregate([{ $match: eventFilter }, { $group: { _id: "$trackId", plays: { $sum: 1 } } }]).toArray(),
    db.collection(COLLECTIONS.tracks).find({}).sort({ popularity: -1, _id: 1 }).limit(800).toArray(),
  ]);
  const playsByTrack = new Map(playRows.map((row) => [row._id.toString(), row.plays]));
  const selectedTracks = tracks
    .map((track) => ({ track, score: chartScore(track, playsByTrack.get(track._id.toString()) || 0, window, now) }))
    .sort((left, right) => right.score - left.score || left.track._id.toString().localeCompare(right.track._id.toString()))
    .slice(0, 50)
    .map((entry) => entry.track);
  const snapshot = { windowType: window.type, windowId: window.windowId, title: window.title, generatedAt: now, trackIds: selectedTracks.map((track) => track._id.toString()) };
  await db.collection(COLLECTIONS.chartSnapshots).updateOne({ windowType: window.type, windowId: window.windowId }, { $set: snapshot }, { upsert: true });
  return { title: window.title, generatedAt: now, tracks: selectedTracks.slice(0, limit) };
}

async function resolveRadioSeed(db, userId, seedType, seedId) {
  if (seedType === "track") {
    const track = await db.collection(COLLECTIONS.tracks).findOne({ _id: seedId });
    if (!track) return null;
    return {
      label: `${track.title} Radio`,
      description: `Similar sounds to ${track.title} by ${track.artistName}.`,
      coverUrl: track.coverUrl || "",
      genres: track.genres || [],
      artistId: track.artistId || null,
      trackId: track._id,
    };
  }

  if (seedType === "artist") {
    const artist = await db.collection(COLLECTIONS.artists).findOne({ _id: seedId });
    if (!artist) return null;
    return {
      label: `${artist.name} Radio`,
      description: `A continuous station built around ${artist.name}.`,
      coverUrl: artist.avatarUrl || "",
      genres: artist.genres || [],
      artistId: artist._id,
      trackId: null,
    };
  }

  const playlist = await db.collection(COLLECTIONS.playlists).findOne({ _id: seedId });
  if (!playlist || (!playlist.isPublic && !sameId(playlist.ownerId, userId))) return null;
  const items = await db.collection(COLLECTIONS.playlistItems).find({ playlistId: seedId }).sort({ position: 1 }).limit(30).toArray();
  const tracks = await loadTracksByIds(db, items.map((item) => item.trackId.toString()));
  return {
    label: `${playlist.name} Radio`,
    description: `A continuous station based on ${playlist.name}.`,
    coverUrl: playlist.coverUrl || tracks[0]?.coverUrl || "",
    genres: [...new Set(tracks.flatMap((track) => track.genres || []))],
    artistId: null,
    trackId: tracks[0]?._id || null,
  };
}

function radioScore(track, session, round) {
  const sharedGenres = (track.genres || []).filter((genre) => session.genres.includes(genre)).length;
  const artistMatch = session.seedArtistId && sameId(track.artistId, session.seedArtistId) ? 1 : 0;
  const popularity = Math.max(0, Math.min(1, Number(track.popularity) / 100));
  const styleMatch = (track.styleTags || []).filter((tag) => session.styleTags?.includes(tag)).length;
  return sharedGenres * 1.15 + artistMatch * 0.8 + styleMatch * 0.25 + popularity * 0.25 + stableNoise(`${track._id}:${round}`) * 0.3;
}

async function ensureRadioQueue(db, session, targetLength) {
  const existingItems = await db.collection(COLLECTIONS.radioQueueItems).find({ sessionId: session._id }).sort({ position: 1 }).toArray();
  if (existingItems.length >= targetLength) return existingItems;
  const tracks = await db.collection(COLLECTIONS.tracks).find({}).sort({ popularity: -1, _id: 1 }).limit(800).toArray();
  const queueItems = [...existingItems];
  let round = Number(session.round) || 0;

  while (queueItems.length < targetLength && tracks.length) {
    const recentTrackIds = new Set(queueItems.slice(-80).map((item) => item.trackId.toString()));
    let candidates = tracks.filter((track) => !recentTrackIds.has(track._id.toString()));
    if (candidates.length < 20) candidates = tracks;
    const required = Math.min(25, targetLength - queueItems.length);
    const selected = candidates
      .filter((track) => !session.seedTrackId || queueItems.length > 0 || !sameId(track._id, session.seedTrackId))
      .map((track) => ({ track, score: radioScore(track, session, round) }))
      .sort((left, right) => right.score - left.score || left.track._id.toString().localeCompare(right.track._id.toString()))
      .slice(0, required)
      .map((entry) => entry.track);
    if (!selected.length) break;
    const startPosition = queueItems.length ? queueItems.at(-1).position + 1 : 0;
    const newItems = selected.map((track, index) => ({ sessionId: session._id, trackId: track._id, position: startPosition + index, addedAt: new Date() }));
    await db.collection(COLLECTIONS.radioQueueItems).insertMany(newItems);
    queueItems.push(...newItems);
    round += 1;
  }
  if (round !== session.round) await db.collection(COLLECTIONS.radioSessions).updateOne({ _id: session._id }, { $set: { round, updatedAt: new Date() } });
  return queueItems;
}

function serializeRadioSession(session) {
  return {
    id: session._id.toString(),
    seedType: session.seedType,
    seedId: session.seedId.toString(),
    name: session.name,
    description: session.description,
    coverUrl: session.coverUrl || null,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

function parseRadioCursor(value, sessionId) {
  if (!value) return -1;
  const cursor = decodeCursor(value);
  if (!cursor || cursor.type !== "radio-queue" || cursor.sessionId !== sessionId.toString() || !Number.isInteger(cursor.position)) return null;
  return cursor.position;
}

async function loadRadioQueue(db, session, cursorPosition, limit) {
  await ensureRadioQueue(db, session, cursorPosition + limit + 5);
  const queueItems = await db.collection(COLLECTIONS.radioQueueItems).find({ sessionId: session._id, position: { $gt: cursorPosition } }).sort({ position: 1 }).limit(limit).toArray();
  const tracks = await loadTracksByIds(db, queueItems.map((item) => item.trackId.toString()));
  const trackById = new Map(tracks.map((track) => [track._id.toString(), track]));
  const data = queueItems.map((item) => {
    const track = trackById.get(item.trackId.toString());
    return track ? { ...serializeTrack(track), radioPosition: item.position } : null;
  }).filter(Boolean);
  const finalPosition = data.at(-1)?.radioPosition;
  return { data, nextCursor: Number.isInteger(finalPosition) ? encodeCursor({ type: "radio-queue", sessionId: session._id.toString(), position: finalPosition }) : null };
}

export function createDiscoveryRouter() {
  const router = Router();
  const radioLimiter = createRateLimiter({ limit: 20, windowMs: 60000 });

  router.get("/charts", async (req, res) => {
    const window = resolveChartWindow(typeof req.query.window === "string" ? req.query.window : "weekly");
    const limit = readPageSize(req.query.limit, 20, 50);
    try {
      const db = await getDatabase();
      const chart = await getChart(db, window, limit);
      return res.json({ title: chart.title, windowType: window.type, generatedAt: chart.generatedAt, data: chart.tracks.map(serializeTrack) });
    } catch {
      return res.status(503).json({ message: "Charts are unavailable" });
    }
  });

  router.post("/radio/sessions", requireUser, radioLimiter, async (req, res) => {
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const seedType = radioSeedTypes.has(body.seedType) ? body.seedType : null;
    const seedId = readObjectId(body.seedId);
    if (!seedType || !seedId) return res.status(400).json({ message: "A valid radio seed is required" });
    try {
      const db = await getDatabase();
      const seed = await resolveRadioSeed(db, req.user._id, seedType, seedId);
      if (!seed) return res.status(404).json({ message: "Radio seed not found" });
      const now = new Date();
      const session = {
        userId: req.user._id,
        seedType,
        seedId,
        seedTrackId: seed.trackId,
        seedArtistId: seed.artistId,
        name: seed.label,
        description: seed.description,
        coverUrl: seed.coverUrl,
        genres: seed.genres,
        styleTags: [],
        status: "active",
        round: 0,
        createdAt: now,
        updatedAt: now,
      };
      const inserted = await db.collection(COLLECTIONS.radioSessions).insertOne(session);
      const storedSession = { ...session, _id: inserted.insertedId };
      const queue = await loadRadioQueue(db, storedSession, -1, 25);
      return res.status(201).json({ data: serializeRadioSession(storedSession), queue: queue.data, nextCursor: queue.nextCursor });
    } catch {
      return res.status(503).json({ message: "Unable to start radio" });
    }
  });

  router.get("/radio/sessions/:sessionId", requireUser, async (req, res) => {
    const sessionId = readObjectId(req.params.sessionId);
    if (!sessionId) return res.status(404).json({ message: "Radio session not found" });
    try {
      const db = await getDatabase();
      const session = await db.collection(COLLECTIONS.radioSessions).findOne({ _id: sessionId, userId: req.user._id });
      if (!session) return res.status(404).json({ message: "Radio session not found" });
      return res.json({ data: serializeRadioSession(session) });
    } catch {
      return res.status(503).json({ message: "Radio session is unavailable" });
    }
  });

  router.get("/radio/sessions/:sessionId/queue", requireUser, async (req, res) => {
    const sessionId = readObjectId(req.params.sessionId);
    const limit = readPageSize(req.query.limit, 25, 50);
    if (!sessionId) return res.status(404).json({ message: "Radio session not found" });
    const cursorPosition = parseRadioCursor(req.query.cursor, sessionId);
    if (cursorPosition === null) return res.status(400).json({ message: "Invalid radio cursor" });
    try {
      const db = await getDatabase();
      const session = await db.collection(COLLECTIONS.radioSessions).findOne({ _id: sessionId, userId: req.user._id, status: "active" });
      if (!session) return res.status(404).json({ message: "Active radio session not found" });
      const queue = await loadRadioQueue(db, session, cursorPosition, limit);
      return res.json(queue);
    } catch {
      return res.status(503).json({ message: "Radio queue is unavailable" });
    }
  });

  router.post("/radio/sessions/:sessionId/stop", requireUser, radioLimiter, async (req, res) => {
    const sessionId = readObjectId(req.params.sessionId);
    if (!sessionId) return res.status(404).json({ message: "Radio session not found" });
    try {
      const db = await getDatabase();
      const result = await db.collection(COLLECTIONS.radioSessions).updateOne({ _id: sessionId, userId: req.user._id, status: "active" }, { $set: { status: "stopped", updatedAt: new Date() } });
      if (!result.matchedCount) return res.status(404).json({ message: "Active radio session not found" });
      return res.json({ status: "stopped" });
    } catch {
      return res.status(503).json({ message: "Unable to stop radio" });
    }
  });

  return router;
}