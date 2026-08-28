import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDatabase } from "../db/connection.js";
import { COLLECTIONS } from "../db/collections.js";
import { readText } from "../lib/filterBuilder.js";
import { invalidateRecommendationCache, recomputeTasteProfile } from "../lib/recommendations.js";
import { createRateLimiter } from "../lib/rateLimit.js";
import { requireUser } from "./auth.js";

const contextTypes = new Set(["home", "playlist", "artist", "album", "search", "radio", "queue", "liked"]);
const queryTypes = new Set(["track", "artist", "album", "playlist", "genre", "mixed"]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readLabels(value, maximum = 8) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((label) => typeof label === "string").map((label) => label.trim().slice(0, 80)).filter(Boolean))].slice(0, maximum);
}

function boundedNumber(value, minimum, maximum) {
  return Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : undefined;
}

export function createEventsRouter() {
  const router = Router();
  const listeningLimit = createRateLimiter({ limit: 80, windowMs: 60000 });
  const searchLimit = createRateLimiter({ limit: 30, windowMs: 60000 });

  router.post("/listening-events", requireUser, listeningLimit, async (req, res) => {
    const body = isPlainObject(req.body) ? req.body : {};
    if (!ObjectId.isValid(body.trackId)) return res.status(400).json({ message: "A valid track is required" });
    const context = isPlainObject(body.context) ? body.context : {};
    const contextType = contextTypes.has(context.type) ? context.type : "queue";
    const refId = readText(context.refId, 64);

    try {
      const db = await getDatabase();
      const trackId = new ObjectId(body.trackId);
      const exists = await db.collection(COLLECTIONS.tracks).findOne({ _id: trackId }, { projection: { _id: 1 } });
      if (!exists) return res.status(404).json({ message: "Track not found" });
      await db.collection(COLLECTIONS.listeningEvents).insertOne({
        userId: req.user._id,
        trackId,
        playedAt: new Date(),
        context: refId ? { type: contextType, refId } : { type: contextType },
        positionSecAtStart: boundedNumber(body.positionSecAtStart, 0, 86400),
        dwellSecApprox: boundedNumber(body.dwellSecApprox, 0, 86400),
      });
      await Promise.all([recomputeTasteProfile(db, req.user._id), invalidateRecommendationCache(db, req.user._id)]);
      return res.status(201).json({ status: "recorded" });
    } catch {
      return res.status(503).json({ message: "Listening history is unavailable" });
    }
  });

  router.post("/search-events", requireUser, searchLimit, async (req, res) => {
    const body = isPlainObject(req.body) ? req.body : {};
    const queryText = readText(body.queryText, 100);
    if (!queryText) return res.status(400).json({ message: "A search query is required" });

    try {
      const db = await getDatabase();
      await db.collection(COLLECTIONS.searchEvents).insertOne({
        userId: req.user._id,
        queryText,
        queryType: queryTypes.has(body.queryType) ? body.queryType : "mixed",
        matchedGenres: readLabels(body.matchedGenres),
        matchedArtists: readLabels(body.matchedArtists),
        createdAt: new Date(),
      });
      await Promise.all([recomputeTasteProfile(db, req.user._id), invalidateRecommendationCache(db, req.user._id)]);
      return res.status(201).json({ status: "recorded" });
    } catch {
      return res.status(503).json({ message: "Search history is unavailable" });
    }
  });

  return router;
}