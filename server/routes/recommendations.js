import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDatabase } from "../db/connection.js";
import { COLLECTIONS } from "../db/collections.js";
import { readPageSize, readText } from "../lib/filterBuilder.js";
import { getRecommendations, resolveRecommendationWindow } from "../lib/recommendations.js";
import { serializePlaylist, serializeTrack } from "../lib/serializers.js";
import { requireUser } from "./auth.js";

export function createRecommendationsRouter() {
  const router = Router();

  router.get("/continue-listening", requireUser, async (req, res) => {
    const limit = readPageSize(req.query.limit, 8, 20);

    try {
      const db = await getDatabase();
      const events = await db.collection(COLLECTIONS.listeningEvents)
        .find({ userId: req.user._id }, { projection: { trackId: 1, playedAt: 1 } })
        .sort({ playedAt: -1, _id: -1 })
        .limit(Math.max(50, limit * 10))
        .toArray();
      const latestEventByTrackId = new Map();
      for (const event of events) {
        const trackId = event.trackId?.toString();
        if (trackId && !latestEventByTrackId.has(trackId)) latestEventByTrackId.set(trackId, event);
        if (latestEventByTrackId.size >= limit) break;
      }
      const trackIds = [...latestEventByTrackId.keys()];
      const tracks = trackIds.length ? await db.collection(COLLECTIONS.tracks).find({ _id: { $in: trackIds.map((trackId) => new ObjectId(trackId)) } }).toArray() : [];
      const trackById = new Map(tracks.map((track) => [track._id.toString(), track]));
      return res.json({ data: trackIds.map((trackId) => {
        const track = trackById.get(trackId);
        return track ? { ...serializeTrack(track), lastPlayedAt: latestEventByTrackId.get(trackId).playedAt } : null;
      }).filter(Boolean) });
    } catch {
      return res.status(503).json({ message: "Continue listening is unavailable" });
    }
  });

  router.get("/", requireUser, async (req, res) => {
    const window = resolveRecommendationWindow(readText(req.query.window || req.query.windowType, 32));
    const limit = readPageSize(req.query.limit, 12, 30);

    try {
      const db = await getDatabase();
      const { tracks, reasonsByTrackId, playlist } = await getRecommendations(db, req.user._id, window, limit);
      return res.json({
        data: tracks.map((track) => ({ ...serializeTrack(track), recommendationReason: reasonsByTrackId[track._id.toString()] })),
        window,
        playlist: serializePlaylist(playlist, tracks.length),
      });
    } catch {
      return res.status(503).json({ message: "Recommendations are unavailable" });
    }
  });

  return router;
}