import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDatabase } from "../db/connection.js";
import { COLLECTIONS } from "../db/collections.js";
import { combineFilters, decodeCursor, encodeCursor, escapeRegex, readPageSize, readText } from "../lib/filterBuilder.js";
import { invalidateRecommendationCache, recomputeTasteProfile } from "../lib/recommendations.js";
import { createRateLimiter } from "../lib/rateLimit.js";
import { serializeAlbum, serializeArtist, serializePlaylist, serializeTrack } from "../lib/serializers.js";
import { requireUser } from "./auth.js";

function readObjectId(value) {
  return typeof value === "string" && ObjectId.isValid(value) ? new ObjectId(value) : null;
}

function sameId(left, right) {
  return left?.toString() === right?.toString();
}

function readNameCursor(value, type, field) {
  if (!value) return {};
  const cursor = decodeCursor(value);
  if (!cursor || cursor.type !== type || !ObjectId.isValid(cursor.id) || typeof cursor.value !== "string") return null;
  const id = new ObjectId(cursor.id);
  return { $or: [{ [field]: { $gt: cursor.value } }, { [field]: cursor.value, _id: { $gt: id } }] };
}

function createNameCursor(type, document, field) {
  if (!document?._id || typeof document[field] !== "string") return null;
  return encodeCursor({ type, id: document._id.toString(), value: document[field] });
}

async function serializeArtistCollection(db, artists, userId) {
  if (!artists.length) return [];
  const artistIds = artists.map((artist) => artist._id);
  const [followRows, followerRows, albumRows] = await Promise.all([
    db.collection(COLLECTIONS.followedArtists).find({ userId, artistId: { $in: artistIds } }, { projection: { artistId: 1 } }).toArray(),
    db.collection(COLLECTIONS.followedArtists).aggregate([{ $match: { artistId: { $in: artistIds } } }, { $group: { _id: "$artistId", count: { $sum: 1 } } }]).toArray(),
    db.collection(COLLECTIONS.albums).aggregate([{ $match: { artistId: { $in: artistIds } } }, { $group: { _id: "$artistId", count: { $sum: 1 } } }]).toArray(),
  ]);
  const followedIds = new Set(followRows.map((row) => row.artistId.toString()));
  const followerCounts = new Map(followerRows.map((row) => [row._id.toString(), row.count]));
  const albumCounts = new Map(albumRows.map((row) => [row._id.toString(), row.count]));
  return artists.map((artist) => serializeArtist(artist, {
    isFollowed: followedIds.has(artist._id.toString()),
    followerCount: Number(artist.followerCount || 0) + Number(followerCounts.get(artist._id.toString()) || 0),
    albumCount: albumCounts.get(artist._id.toString()) || 0,
  }));
}

async function serializeAlbumCollection(db, albums, userId) {
  if (!albums.length) return [];
  const albumIds = albums.map((album) => album._id);
  const [savedRows, trackRows] = await Promise.all([
    db.collection(COLLECTIONS.savedAlbums).find({ userId, albumId: { $in: albumIds } }, { projection: { albumId: 1 } }).toArray(),
    db.collection(COLLECTIONS.tracks).aggregate([{ $match: { albumId: { $in: albumIds } } }, { $group: { _id: "$albumId", count: { $sum: 1 } } }]).toArray(),
  ]);
  const savedIds = new Set(savedRows.map((row) => row.albumId.toString()));
  const trackCounts = new Map(trackRows.map((row) => [row._id.toString(), row.count]));
  return albums.map((album) => serializeAlbum(album, {
    isSaved: savedIds.has(album._id.toString()),
    trackCount: trackCounts.get(album._id.toString()) || 0,
  }));
}

async function serializePlaylistCollection(db, playlists, userId) {
  if (!playlists.length) return [];
  const playlistIds = playlists.map((playlist) => playlist._id);
  const [itemRows, followRows, followerRows] = await Promise.all([
    db.collection(COLLECTIONS.playlistItems).aggregate([{ $match: { playlistId: { $in: playlistIds } } }, { $group: { _id: "$playlistId", count: { $sum: 1 } } }]).toArray(),
    db.collection(COLLECTIONS.followedPlaylists).find({ userId, playlistId: { $in: playlistIds } }, { projection: { playlistId: 1 } }).toArray(),
    db.collection(COLLECTIONS.followedPlaylists).aggregate([{ $match: { playlistId: { $in: playlistIds } } }, { $group: { _id: "$playlistId", count: { $sum: 1 } } }]).toArray(),
  ]);
  const itemCounts = new Map(itemRows.map((row) => [row._id.toString(), row.count]));
  const followedIds = new Set(followRows.map((row) => row.playlistId.toString()));
  const followerCounts = new Map(followerRows.map((row) => [row._id.toString(), row.count]));
  return playlists.map((playlist) => serializePlaylist(playlist, itemCounts.get(playlist._id.toString()) || 0, {
    isOwner: sameId(playlist.ownerId, userId),
    isFollowed: followedIds.has(playlist._id.toString()),
    followerCount: Number(playlist.followerCount || 0) + Number(followerCounts.get(playlist._id.toString()) || 0),
  }));
}

function readSearchExpression(value) {
  const query = readText(value, 100);
  return query ? { query, expression: { $regex: escapeRegex(query), $options: "i" } } : { query: "", expression: null };
}

export function createCatalogRouter() {
  const router = Router();
  const followLimiter = createRateLimiter({ limit: 30, windowMs: 60000 });

  router.get("/search/recent", requireUser, async (req, res) => {
    const limit = readPageSize(req.query.limit, 6, 12);
    try {
      const db = await getDatabase();
      const rows = await db.collection(COLLECTIONS.searchEvents).aggregate([
        { $match: { userId: req.user._id } },
        { $sort: { createdAt: -1, _id: -1 } },
        { $group: { _id: "$queryText", queryText: { $first: "$queryText" }, queryType: { $first: "$queryType" }, createdAt: { $first: "$createdAt" } } },
        { $sort: { createdAt: -1, _id: 1 } },
        { $limit: limit },
      ]).toArray();
      return res.json({ data: rows.map((row) => ({ queryText: row.queryText, queryType: row.queryType, createdAt: row.createdAt })) });
    } catch {
      return res.status(503).json({ message: "Recent searches are unavailable" });
    }
  });

  router.get("/search", requireUser, async (req, res) => {
    const { query, expression } = readSearchExpression(req.query.query);
    if (!query || !expression) return res.json({ tracks: [], artists: [], albums: [], playlists: [], genres: [] });
    const limit = readPageSize(req.query.limit, 8, 12);

    try {
      const db = await getDatabase();
      const [tracks, artists, albums, playlists] = await Promise.all([
        db.collection(COLLECTIONS.tracks).find({ $or: [{ title: expression }, { artistName: expression }, { albumName: expression }, { genres: expression }] }).sort({ popularity: -1, _id: 1 }).limit(limit).toArray(),
        db.collection(COLLECTIONS.artists).find({ $or: [{ name: expression }, { genres: expression }] }).sort({ name: 1, _id: 1 }).limit(limit).toArray(),
        db.collection(COLLECTIONS.albums).find({ $or: [{ title: expression }, { artistName: expression }, { genres: expression }] }).sort({ releaseDate: -1, _id: 1 }).limit(limit).toArray(),
        db.collection(COLLECTIONS.playlists).find(combineFilters(
          { $or: [{ ownerId: req.user._id }, { isPublic: true }] },
          { $or: [{ name: expression }, { description: expression }] },
        )).sort({ updatedAt: -1, _id: 1 }).limit(limit).toArray(),
      ]);
      const serializedArtists = await serializeArtistCollection(db, artists, req.user._id);
      const serializedAlbums = await serializeAlbumCollection(db, albums, req.user._id);
      const serializedPlaylists = await serializePlaylistCollection(db, playlists, req.user._id);
      const genres = [...new Set([...tracks.flatMap((track) => track.genres || []), ...artists.flatMap((artist) => artist.genres || [])])].slice(0, 12);
      return res.json({ tracks: tracks.map(serializeTrack), artists: serializedArtists, albums: serializedAlbums, playlists: serializedPlaylists, genres });
    } catch {
      return res.status(503).json({ message: "Search is unavailable" });
    }
  });

  router.get("/artists", requireUser, async (req, res) => {
    const { query, expression } = readSearchExpression(req.query.query);
    const limit = readPageSize(req.query.limit);
    const cursorFilter = readNameCursor(req.query.cursor, "artists", "name");
    if (req.query.cursor && !cursorFilter) return res.status(400).json({ message: "Invalid artist cursor" });

    try {
      const db = await getDatabase();
      const filters = [];
      if (expression) filters.push({ $or: [{ name: expression }, { genres: expression }] });
      if (req.query.followed === "true") {
        const follows = await db.collection(COLLECTIONS.followedArtists).find({ userId: req.user._id }, { projection: { artistId: 1 } }).toArray();
        if (!follows.length) return res.json({ data: [], nextCursor: null });
        filters.push({ _id: { $in: follows.map((follow) => follow.artistId) } });
      }
      if (cursorFilter && Object.keys(cursorFilter).length) filters.push(cursorFilter);
      const documents = await db.collection(COLLECTIONS.artists).find(combineFilters(...filters)).sort({ name: 1, _id: 1 }).limit(limit + 1).toArray();
      const hasNextPage = documents.length > limit;
      const artists = documents.slice(0, limit);
      return res.json({ data: await serializeArtistCollection(db, artists, req.user._id), nextCursor: hasNextPage ? createNameCursor("artists", artists.at(-1), "name") : null });
    } catch {
      return res.status(503).json({ message: "Artists are unavailable" });
    }
  });

  router.post("/artists/:artistId/follow", requireUser, followLimiter, async (req, res) => {
    const artistId = readObjectId(req.params.artistId);
    if (!artistId) return res.status(404).json({ message: "Artist not found" });
    try {
      const db = await getDatabase();
      const artist = await db.collection(COLLECTIONS.artists).findOne({ _id: artistId }, { projection: { _id: 1 } });
      if (!artist) return res.status(404).json({ message: "Artist not found" });
      await db.collection(COLLECTIONS.followedArtists).updateOne({ userId: req.user._id, artistId }, { $setOnInsert: { userId: req.user._id, artistId, followedAt: new Date() } }, { upsert: true });
      await Promise.all([recomputeTasteProfile(db, req.user._id), invalidateRecommendationCache(db, req.user._id)]);
      return res.status(201).json({ followed: true, artistId: artistId.toString() });
    } catch {
      return res.status(503).json({ message: "Unable to follow this artist" });
    }
  });

  router.delete("/artists/:artistId/follow", requireUser, followLimiter, async (req, res) => {
    const artistId = readObjectId(req.params.artistId);
    if (!artistId) return res.status(404).json({ message: "Artist not found" });
    try {
      const db = await getDatabase();
      await db.collection(COLLECTIONS.followedArtists).deleteOne({ userId: req.user._id, artistId });
      await Promise.all([recomputeTasteProfile(db, req.user._id), invalidateRecommendationCache(db, req.user._id)]);
      return res.json({ followed: false, artistId: artistId.toString() });
    } catch {
      return res.status(503).json({ message: "Unable to unfollow this artist" });
    }
  });

  router.get("/artists/:artistId", requireUser, async (req, res) => {
    const artistId = readObjectId(req.params.artistId);
    if (!artistId) return res.status(404).json({ message: "Artist not found" });
    try {
      const db = await getDatabase();
      const artist = await db.collection(COLLECTIONS.artists).findOne({ _id: artistId });
      if (!artist) return res.status(404).json({ message: "Artist not found" });
      const [serializedArtist] = await serializeArtistCollection(db, [artist], req.user._id);
      let topTracks = await db.collection(COLLECTIONS.tracks).find({ artistId }).sort({ popularity: -1, _id: 1 }).limit(10).toArray();
      if (!topTracks.length) topTracks = await db.collection(COLLECTIONS.tracks).find({ artistName: artist.name }).sort({ popularity: -1, _id: 1 }).limit(10).toArray();
      const albums = await db.collection(COLLECTIONS.albums).find({ artistId }).sort({ releaseDate: -1, _id: 1 }).limit(24).toArray();
      const relatedArtists = artist.genres?.length
        ? await db.collection(COLLECTIONS.artists).find({ _id: { $ne: artistId }, genres: { $in: artist.genres } }).sort({ followerCount: -1, name: 1 }).limit(8).toArray()
        : [];
      return res.json({ data: serializedArtist, topTracks: topTracks.map(serializeTrack), albums: await serializeAlbumCollection(db, albums, req.user._id), relatedArtists: await serializeArtistCollection(db, relatedArtists, req.user._id) });
    } catch {
      return res.status(503).json({ message: "Artist is unavailable" });
    }
  });

  router.get("/albums", requireUser, async (req, res) => {
    const { expression } = readSearchExpression(req.query.query);
    const limit = readPageSize(req.query.limit);
    const cursorFilter = readNameCursor(req.query.cursor, "albums", "title");
    if (req.query.cursor && !cursorFilter) return res.status(400).json({ message: "Invalid album cursor" });

    try {
      const db = await getDatabase();
      const filters = [];
      if (expression) filters.push({ $or: [{ title: expression }, { artistName: expression }, { genres: expression }] });
      if (req.query.saved === "true") {
        const saves = await db.collection(COLLECTIONS.savedAlbums).find({ userId: req.user._id }, { projection: { albumId: 1 } }).toArray();
        if (!saves.length) return res.json({ data: [], nextCursor: null });
        filters.push({ _id: { $in: saves.map((save) => save.albumId) } });
      }
      if (cursorFilter && Object.keys(cursorFilter).length) filters.push(cursorFilter);
      const documents = await db.collection(COLLECTIONS.albums).find(combineFilters(...filters)).sort({ title: 1, _id: 1 }).limit(limit + 1).toArray();
      const hasNextPage = documents.length > limit;
      const albums = documents.slice(0, limit);
      return res.json({ data: await serializeAlbumCollection(db, albums, req.user._id), nextCursor: hasNextPage ? createNameCursor("albums", albums.at(-1), "title") : null });
    } catch {
      return res.status(503).json({ message: "Albums are unavailable" });
    }
  });

  router.post("/albums/:albumId/save", requireUser, followLimiter, async (req, res) => {
    const albumId = readObjectId(req.params.albumId);
    if (!albumId) return res.status(404).json({ message: "Album not found" });
    try {
      const db = await getDatabase();
      const album = await db.collection(COLLECTIONS.albums).findOne({ _id: albumId }, { projection: { _id: 1 } });
      if (!album) return res.status(404).json({ message: "Album not found" });
      await db.collection(COLLECTIONS.savedAlbums).updateOne({ userId: req.user._id, albumId }, { $setOnInsert: { userId: req.user._id, albumId, savedAt: new Date() } }, { upsert: true });
      return res.status(201).json({ saved: true, albumId: albumId.toString() });
    } catch {
      return res.status(503).json({ message: "Unable to save this album" });
    }
  });

  router.delete("/albums/:albumId/save", requireUser, followLimiter, async (req, res) => {
    const albumId = readObjectId(req.params.albumId);
    if (!albumId) return res.status(404).json({ message: "Album not found" });
    try {
      const db = await getDatabase();
      await db.collection(COLLECTIONS.savedAlbums).deleteOne({ userId: req.user._id, albumId });
      return res.json({ saved: false, albumId: albumId.toString() });
    } catch {
      return res.status(503).json({ message: "Unable to remove this album" });
    }
  });

  router.get("/albums/:albumId", requireUser, async (req, res) => {
    const albumId = readObjectId(req.params.albumId);
    if (!albumId) return res.status(404).json({ message: "Album not found" });
    try {
      const db = await getDatabase();
      const album = await db.collection(COLLECTIONS.albums).findOne({ _id: albumId });
      if (!album) return res.status(404).json({ message: "Album not found" });
      const [serializedAlbum] = await serializeAlbumCollection(db, [album], req.user._id);
      const tracks = await db.collection(COLLECTIONS.tracks).find({ albumId }).sort({ albumOrder: 1, _id: 1 }).toArray();
      return res.json({ data: serializedAlbum, tracks: tracks.map(serializeTrack) });
    } catch {
      return res.status(503).json({ message: "Album is unavailable" });
    }
  });

  return router;
}