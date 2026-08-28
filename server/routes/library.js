import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDatabase } from "../db/connection.js";
import { COLLECTIONS } from "../db/collections.js";
import { decodeCursor, encodeCursor, escapeRegex, readPageSize, readText } from "../lib/filterBuilder.js";
import { invalidateRecommendationCache, recomputeTasteProfile } from "../lib/recommendations.js";
import { createRateLimiter } from "../lib/rateLimit.js";
import { serializePlaylist, serializeTrack } from "../lib/serializers.js";
import { requireUser } from "./auth.js";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sameId(left, right) {
  return left?.toString() === right?.toString();
}

function readObjectId(value) {
  return typeof value === "string" && ObjectId.isValid(value) ? new ObjectId(value) : null;
}

function validatePlaylist(body) {
  const changes = {};
  if (Object.hasOwn(body, "name")) {
    const name = readText(body.name, 80);
    if (!/^[A-Za-z0-9][A-Za-z0-9 .,'!&()_-]{1,79}$/.test(name)) return { error: "Playlist name must be 2-80 valid characters" };
    changes.name = name;
  }
  if (Object.hasOwn(body, "description")) {
    const description = readText(body.description, 500);
    if (/[\u0000-\u001F]/.test(description)) return { error: "Playlist description contains unsupported characters" };
    changes.description = description;
  }
  if (Object.hasOwn(body, "isPublic") && typeof body.isPublic === "boolean") changes.isPublic = body.isPublic;
  if (Object.hasOwn(body, "coverUrl")) {
    const coverUrl = readText(body.coverUrl, 2000);
    if (coverUrl && !/^https:\/\//i.test(coverUrl)) return { error: "Cover URL must use HTTPS" };
    changes.coverUrl = coverUrl;
  }
  return { changes };
}

function parseDescendingDateCursor(value, type, field) {
  const cursor = decodeCursor(value);
  if (!cursor || cursor.type !== type || !ObjectId.isValid(cursor.id)) return null;
  const date = new Date(cursor.value);
  if (Number.isNaN(date.getTime())) return null;
  return { $or: [{ [field]: { $lt: date } }, { [field]: date, _id: { $lt: new ObjectId(cursor.id) } }] };
}

function createDescendingDateCursor(type, document, field) {
  return encodeCursor({ type, id: document._id.toString(), value: new Date(document[field]).toISOString() });
}

function parsePositionCursor(value) {
  const cursor = decodeCursor(value);
  if (!cursor || cursor.type !== "playlist-items" || !ObjectId.isValid(cursor.id) || !Number.isInteger(cursor.position)) return null;
  return { $or: [{ position: { $gt: cursor.position } }, { position: cursor.position, _id: { $gt: new ObjectId(cursor.id) } }] };
}

async function getPlaylistWithAccess(db, playlistId, userId) {
  const playlist = await db.collection(COLLECTIONS.playlists).findOne({ _id: playlistId });
  if (!playlist || (!playlist.isPublic && !sameId(playlist.ownerId, userId))) return null;
  return playlist;
}

async function serializePlaylists(db, playlists, userId) {
  const ids = playlists.map((playlist) => playlist._id);
  const [counts, follows, followerCounts] = ids.length ? await Promise.all([
    db.collection(COLLECTIONS.playlistItems).aggregate([{ $match: { playlistId: { $in: ids } } }, { $group: { _id: "$playlistId", count: { $sum: 1 } } }]).toArray(),
    db.collection(COLLECTIONS.followedPlaylists).find({ userId, playlistId: { $in: ids } }, { projection: { playlistId: 1 } }).toArray(),
    db.collection(COLLECTIONS.followedPlaylists).aggregate([{ $match: { playlistId: { $in: ids } } }, { $group: { _id: "$playlistId", count: { $sum: 1 } } }]).toArray(),
  ]) : [[], [], []];
  const countByPlaylist = new Map(counts.map((entry) => [entry._id.toString(), entry.count]));
  const followedIds = new Set(follows.map((follow) => follow.playlistId.toString()));
  const followerCountByPlaylist = new Map(followerCounts.map((entry) => [entry._id.toString(), entry.count]));
  return playlists.map((playlist) => serializePlaylist(playlist, countByPlaylist.get(playlist._id.toString()), {
    isOwner: sameId(playlist.ownerId, userId),
    isFollowed: followedIds.has(playlist._id.toString()),
    followerCount: Number(playlist.followerCount || 0) + Number(followerCountByPlaylist.get(playlist._id.toString()) || 0),
  }));
}

export function createLibraryRouter() {
  const router = Router();
  const likeLimit = createRateLimiter({ limit: 40, windowMs: 60000 });
  const playlistLimit = createRateLimiter({ limit: 30, windowMs: 60000 });

  router.get("/likes", requireUser, async (req, res) => {
    const limit = readPageSize(req.query.limit);
    const cursorFilter = req.query.cursor ? parseDescendingDateCursor(req.query.cursor, "likes", "likedAt") : {};
    if (req.query.cursor && !cursorFilter) return res.status(400).json({ message: "Invalid likes cursor" });

    try {
      const db = await getDatabase();
      const documents = await db.collection(COLLECTIONS.likes)
        .find(cursorFilter && Object.keys(cursorFilter).length ? { $and: [{ userId: req.user._id }, cursorFilter] } : { userId: req.user._id })
        .sort({ likedAt: -1, _id: -1 })
        .limit(limit + 1)
        .toArray();
      const hasNextPage = documents.length > limit;
      const likes = documents.slice(0, limit);
      const tracks = await db.collection(COLLECTIONS.tracks).find({ _id: { $in: likes.map((like) => like.trackId) } }).toArray();
      const trackById = new Map(tracks.map((track) => [track._id.toString(), track]));
      return res.json({
        data: likes.map((like) => ({ ...serializeTrack(trackById.get(like.trackId.toString())), likedAt: like.likedAt })).filter((track) => track.id),
        nextCursor: hasNextPage ? createDescendingDateCursor("likes", likes.at(-1), "likedAt") : null,
      });
    } catch {
      return res.status(503).json({ message: "Liked songs are unavailable" });
    }
  });

  router.post("/likes/:trackId", requireUser, likeLimit, async (req, res) => {
    const trackId = readObjectId(req.params.trackId);
    if (!trackId) return res.status(404).json({ message: "Track not found" });

    try {
      const db = await getDatabase();
      const track = await db.collection(COLLECTIONS.tracks).findOne({ _id: trackId }, { projection: { _id: 1 } });
      if (!track) return res.status(404).json({ message: "Track not found" });
      await db.collection(COLLECTIONS.likes).updateOne({ userId: req.user._id, trackId }, { $setOnInsert: { userId: req.user._id, trackId, likedAt: new Date() } }, { upsert: true });
      await Promise.all([recomputeTasteProfile(db, req.user._id), invalidateRecommendationCache(db, req.user._id)]);
      return res.status(201).json({ liked: true, trackId: trackId.toString() });
    } catch {
      return res.status(503).json({ message: "Unable to like this track" });
    }
  });

  router.delete("/likes/:trackId", requireUser, likeLimit, async (req, res) => {
    const trackId = readObjectId(req.params.trackId);
    if (!trackId) return res.status(404).json({ message: "Track not found" });

    try {
      const db = await getDatabase();
      await db.collection(COLLECTIONS.likes).deleteOne({ userId: req.user._id, trackId });
      await Promise.all([recomputeTasteProfile(db, req.user._id), invalidateRecommendationCache(db, req.user._id)]);
      return res.json({ liked: false, trackId: trackId.toString() });
    } catch {
      return res.status(503).json({ message: "Unable to remove this like" });
    }
  });

  router.get("/playlists", requireUser, async (req, res) => {
    const limit = readPageSize(req.query.limit);
    const search = readText(req.query.search, 80);
    const cursorFilter = req.query.cursor ? parseDescendingDateCursor(req.query.cursor, "playlists", "createdAt") : {};
    if (req.query.cursor && !cursorFilter) return res.status(400).json({ message: "Invalid playlists cursor" });
    const scope = req.query.scope === "library" ? "library" : "owned";
    const followedOnly = req.query.followedBy === "me";
    const requestedOwnerId = req.query.ownerId ? readObjectId(req.query.ownerId) : req.user._id;
    if (!requestedOwnerId) return res.status(400).json({ message: "Invalid playlist owner" });

    try {
      const db = await getDatabase();
      const filters = [];
      if (scope === "library" || followedOnly) {
        const follows = await db.collection(COLLECTIONS.followedPlaylists).find({ userId: req.user._id }, { projection: { playlistId: 1 } }).toArray();
        const followedIds = follows.map((follow) => follow.playlistId);
        if (followedOnly) {
          if (!followedIds.length) return res.json({ data: [], nextCursor: null });
          filters.push({ _id: { $in: followedIds } });
        } else {
          filters.push(followedIds.length ? { $or: [{ ownerId: req.user._id }, { _id: { $in: followedIds } }] } : { ownerId: req.user._id });
        }
      } else {
        filters.push({ ownerId: requestedOwnerId });
        if (!sameId(requestedOwnerId, req.user._id)) filters.push({ isPublic: true });
      }
      if (search) filters.push({ name: { $regex: escapeRegex(search), $options: "i" } });
      if (cursorFilter && Object.keys(cursorFilter).length) filters.push(cursorFilter);
      const documents = await db.collection(COLLECTIONS.playlists).find(filters.length === 1 ? filters[0] : { $and: filters }).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).toArray();
      const hasNextPage = documents.length > limit;
      const playlists = documents.slice(0, limit);
      return res.json({ data: await serializePlaylists(db, playlists, req.user._id), nextCursor: hasNextPage ? createDescendingDateCursor("playlists", playlists.at(-1), "createdAt") : null });
    } catch {
      return res.status(503).json({ message: "Playlists are unavailable" });
    }
  });

  router.post("/playlists", requireUser, playlistLimit, async (req, res) => {
    const body = isPlainObject(req.body) ? req.body : {};
    const { changes, error } = validatePlaylist(body);
    if (error) return res.status(400).json({ message: error });
    if (!changes.name) return res.status(400).json({ message: "Playlist name is required" });
    const type = body.type === "favorites" ? "favorites" : "user";

    try {
      const db = await getDatabase();
      const now = new Date();
      const playlist = { ownerId: req.user._id, type, isPublic: false, description: "", coverUrl: "", ...changes, createdAt: now, updatedAt: now };
      const inserted = await db.collection(COLLECTIONS.playlists).insertOne(playlist);
      return res.status(201).json({ data: serializePlaylist({ ...playlist, _id: inserted.insertedId }, 0, { isOwner: true }) });
    } catch {
      return res.status(503).json({ message: "Unable to create playlist" });
    }
  });

  router.get("/playlists/:playlistId", requireUser, async (req, res) => {
    const playlistId = readObjectId(req.params.playlistId);
    if (!playlistId) return res.status(404).json({ message: "Playlist not found" });

    try {
      const db = await getDatabase();
      const playlist = await getPlaylistWithAccess(db, playlistId, req.user._id);
      if (!playlist) return res.status(404).json({ message: "Playlist not found" });
      const itemCount = await db.collection(COLLECTIONS.playlistItems).countDocuments({ playlistId });
      const [follow, followerCount] = await Promise.all([
        db.collection(COLLECTIONS.followedPlaylists).findOne({ userId: req.user._id, playlistId }),
        db.collection(COLLECTIONS.followedPlaylists).countDocuments({ playlistId }),
      ]);
      return res.json({ data: serializePlaylist(playlist, itemCount, { isOwner: sameId(playlist.ownerId, req.user._id), isFollowed: Boolean(follow), followerCount: Number(playlist.followerCount || 0) + followerCount }) });
    } catch {
      return res.status(503).json({ message: "Playlist is unavailable" });
    }
  });

  router.patch("/playlists/:playlistId", requireUser, playlistLimit, async (req, res) => {
    const playlistId = readObjectId(req.params.playlistId);
    const body = isPlainObject(req.body) ? req.body : {};
    const { changes, error } = validatePlaylist(body);
    if (!playlistId) return res.status(404).json({ message: "Playlist not found" });
    if (error) return res.status(400).json({ message: error });
    if (!Object.keys(changes).length) return res.status(400).json({ message: "No supported playlist changes" });

    try {
      const db = await getDatabase();
      const playlist = await db.collection(COLLECTIONS.playlists).findOne({ _id: playlistId });
      if (!playlist || !sameId(playlist.ownerId, req.user._id)) return res.status(404).json({ message: "Playlist not found" });
      if (playlist.type === "system") return res.status(403).json({ message: "System playlists cannot be edited" });
      changes.updatedAt = new Date();
      await db.collection(COLLECTIONS.playlists).updateOne({ _id: playlistId }, { $set: changes });
      const itemCount = await db.collection(COLLECTIONS.playlistItems).countDocuments({ playlistId });
      return res.json({ data: serializePlaylist({ ...playlist, ...changes }, itemCount, { isOwner: true }) });
    } catch {
      return res.status(503).json({ message: "Unable to update playlist" });
    }
  });

  router.delete("/playlists/:playlistId", requireUser, playlistLimit, async (req, res) => {
    const playlistId = readObjectId(req.params.playlistId);
    if (!playlistId) return res.status(404).json({ message: "Playlist not found" });

    try {
      const db = await getDatabase();
      const playlist = await db.collection(COLLECTIONS.playlists).findOne({ _id: playlistId });
      if (!playlist || !sameId(playlist.ownerId, req.user._id)) return res.status(404).json({ message: "Playlist not found" });
      if (playlist.type === "system") return res.status(403).json({ message: "System playlists cannot be deleted" });
      await Promise.all([
        db.collection(COLLECTIONS.playlists).deleteOne({ _id: playlistId }),
        db.collection(COLLECTIONS.playlistItems).deleteMany({ playlistId }),
      ]);
      return res.status(204).end();
    } catch {
      return res.status(503).json({ message: "Unable to delete playlist" });
    }
  });

  router.post("/playlists/:playlistId/follow", requireUser, playlistLimit, async (req, res) => {
    const playlistId = readObjectId(req.params.playlistId);
    if (!playlistId) return res.status(404).json({ message: "Playlist not found" });
    try {
      const db = await getDatabase();
      const playlist = await getPlaylistWithAccess(db, playlistId, req.user._id);
      if (!playlist) return res.status(404).json({ message: "Playlist not found" });
      if (sameId(playlist.ownerId, req.user._id)) return res.status(400).json({ message: "You already own this playlist" });
      await db.collection(COLLECTIONS.followedPlaylists).updateOne({ userId: req.user._id, playlistId }, { $setOnInsert: { userId: req.user._id, playlistId, followedAt: new Date() } }, { upsert: true });
      return res.status(201).json({ followed: true, playlistId: playlistId.toString() });
    } catch {
      return res.status(503).json({ message: "Unable to follow this playlist" });
    }
  });

  router.delete("/playlists/:playlistId/follow", requireUser, playlistLimit, async (req, res) => {
    const playlistId = readObjectId(req.params.playlistId);
    if (!playlistId) return res.status(404).json({ message: "Playlist not found" });
    try {
      const db = await getDatabase();
      await db.collection(COLLECTIONS.followedPlaylists).deleteOne({ userId: req.user._id, playlistId });
      return res.json({ followed: false, playlistId: playlistId.toString() });
    } catch {
      return res.status(503).json({ message: "Unable to unfollow this playlist" });
    }
  });

  router.get("/playlists/:playlistId/items", requireUser, async (req, res) => {
    const playlistId = readObjectId(req.params.playlistId);
    const limit = readPageSize(req.query.limit);
    const cursorFilter = req.query.cursor ? parsePositionCursor(req.query.cursor) : {};
    if (!playlistId) return res.status(404).json({ message: "Playlist not found" });
    if (req.query.cursor && !cursorFilter) return res.status(400).json({ message: "Invalid playlist cursor" });

    try {
      const db = await getDatabase();
      const playlist = await getPlaylistWithAccess(db, playlistId, req.user._id);
      if (!playlist) return res.status(404).json({ message: "Playlist not found" });
      const filter = cursorFilter && Object.keys(cursorFilter).length ? { $and: [{ playlistId }, cursorFilter] } : { playlistId };
      const documents = await db.collection(COLLECTIONS.playlistItems).find(filter).sort({ position: 1, _id: 1 }).limit(limit + 1).toArray();
      const hasNextPage = documents.length > limit;
      const items = documents.slice(0, limit);
      const tracks = await db.collection(COLLECTIONS.tracks).find({ _id: { $in: items.map((item) => item.trackId) } }).toArray();
      const trackById = new Map(tracks.map((track) => [track._id.toString(), track]));
      return res.json({
        data: items.map((item) => ({ ...serializeTrack(trackById.get(item.trackId.toString())), position: item.position })).filter((track) => track.id),
        nextCursor: hasNextPage ? encodeCursor({ type: "playlist-items", id: items.at(-1)._id.toString(), position: items.at(-1).position }) : null,
      });
    } catch {
      return res.status(503).json({ message: "Playlist tracks are unavailable" });
    }
  });

  router.post("/playlists/:playlistId/items", requireUser, playlistLimit, async (req, res) => {
    const playlistId = readObjectId(req.params.playlistId);
    const body = isPlainObject(req.body) ? req.body : {};
    const trackIds = Array.isArray(body.trackIds) ? [...new Set(body.trackIds.filter((id) => typeof id === "string" && ObjectId.isValid(id)))].slice(0, 50) : [];
    if (!playlistId) return res.status(404).json({ message: "Playlist not found" });
    if (!trackIds.length) return res.status(400).json({ message: "Provide one to fifty valid track ids" });

    try {
      const db = await getDatabase();
      const playlist = await db.collection(COLLECTIONS.playlists).findOne({ _id: playlistId });
      if (!playlist || !sameId(playlist.ownerId, req.user._id) || playlist.type === "system") return res.status(404).json({ message: "Playlist not found" });
      const objectIds = trackIds.map((id) => new ObjectId(id));
      const [tracks, existingItems, finalItem] = await Promise.all([
        db.collection(COLLECTIONS.tracks).find({ _id: { $in: objectIds } }, { projection: { _id: 1 } }).toArray(),
        db.collection(COLLECTIONS.playlistItems).find({ playlistId, trackId: { $in: objectIds } }, { projection: { trackId: 1 } }).toArray(),
        db.collection(COLLECTIONS.playlistItems).find({ playlistId }).sort({ position: -1 }).limit(1).next(),
      ]);
      const availableIds = new Set(tracks.map((track) => track._id.toString()));
      const existingIds = new Set(existingItems.map((item) => item.trackId.toString()));
      const addedTrackIds = trackIds.filter((id) => availableIds.has(id) && !existingIds.has(id));
      if (addedTrackIds.length) {
        const startPosition = (finalItem?.position ?? -1) + 1;
        const now = new Date();
        await db.collection(COLLECTIONS.playlistItems).insertMany(addedTrackIds.map((id, index) => ({ playlistId, trackId: new ObjectId(id), addedAt: now, position: startPosition + index })));
        await db.collection(COLLECTIONS.playlists).updateOne({ _id: playlistId }, { $set: { updatedAt: now } });
      }
      return res.status(201).json({ addedTrackIds, skippedTrackIds: trackIds.filter((id) => !addedTrackIds.includes(id)) });
    } catch {
      return res.status(503).json({ message: "Unable to add tracks to playlist" });
    }
  });

  router.delete("/playlists/:playlistId/items/:trackId", requireUser, playlistLimit, async (req, res) => {
    const playlistId = readObjectId(req.params.playlistId);
    const trackId = readObjectId(req.params.trackId);
    if (!playlistId || !trackId) return res.status(404).json({ message: "Playlist item not found" });

    try {
      const db = await getDatabase();
      const playlist = await db.collection(COLLECTIONS.playlists).findOne({ _id: playlistId });
      if (!playlist || !sameId(playlist.ownerId, req.user._id) || playlist.type === "system") return res.status(404).json({ message: "Playlist not found" });
      const deleted = await db.collection(COLLECTIONS.playlistItems).deleteOne({ playlistId, trackId });
      if (!deleted.deletedCount) return res.status(404).json({ message: "Playlist item not found" });
      await db.collection(COLLECTIONS.playlists).updateOne({ _id: playlistId }, { $set: { updatedAt: new Date() } });
      return res.status(204).end();
    } catch {
      return res.status(503).json({ message: "Unable to remove playlist item" });
    }
  });

  return router;
}