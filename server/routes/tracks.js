import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDatabase } from "../db/connection.js";
import { COLLECTIONS } from "../db/collections.js";
import { buildTrackCursorFilter, buildTrackFilter, combineFilters, createTrackCursor, decodeCursor, getTrackSort } from "../lib/filterBuilder.js";
import { serializeTrack } from "../lib/serializers.js";

export function createTrackRouter() {
  const router = Router();

  router.get("/", async (req, res) => {
    const { filter, sort, limit } = buildTrackFilter(req.query);
    const cursor = req.query.cursor ? decodeCursor(req.query.cursor) : null;
    const cursorFilter = cursor ? buildTrackCursorFilter(sort, cursor) : {};

    if (req.query.cursor && !cursorFilter) return res.status(400).json({ message: "Invalid catalog cursor" });

    try {
      const db = await getDatabase();
      const documents = await db.collection(COLLECTIONS.tracks)
        .find(combineFilters(filter, cursorFilter))
        .sort(getTrackSort(sort))
        .limit(limit + 1)
        .toArray();
      const hasNextPage = documents.length > limit;
      const tracks = documents.slice(0, limit);
      return res.json({
        data: tracks.map(serializeTrack),
        nextCursor: hasNextPage ? createTrackCursor(sort, tracks.at(-1)) : null,
      });
    } catch {
      return res.status(503).json({ message: "Catalog unavailable" });
    }
  });

  router.get("/:trackId", async (req, res) => {
    if (!ObjectId.isValid(req.params.trackId)) return res.status(404).json({ message: "Track not found" });

    try {
      const db = await getDatabase();
      const track = await db.collection(COLLECTIONS.tracks).findOne({ _id: new ObjectId(req.params.trackId) });
      if (!track) return res.status(404).json({ message: "Track not found" });
      return res.json({ data: serializeTrack(track) });
    } catch {
      return res.status(503).json({ message: "Catalog unavailable" });
    }
  });

  return router;
}