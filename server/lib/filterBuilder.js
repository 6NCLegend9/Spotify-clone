import { ObjectId } from "mongodb";

const TRACK_SORTS = new Set(["relevance", "popularity", "newest"]);

export function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function readText(value, maxLength = 100) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function readPageSize(value, defaultValue = 20, maximum = 50) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : defaultValue;
}

export function buildTrackFilter(query) {
  const text = readText(query.query);
  const genre = readText(query.genre, 48);
  const artist = readText(query.artist, 100);
  const filter = {};
  const clauses = [];

  if (text) {
    const expression = { $regex: escapeRegex(text), $options: "i" };
    clauses.push({ $or: [{ title: expression }, { artistName: expression }, { albumName: expression }] });
  }
  if (genre) clauses.push({ genres: { $regex: `^${escapeRegex(genre)}$`, $options: "i" } });
  if (artist) clauses.push({ artistName: { $regex: escapeRegex(artist), $options: "i" } });

  if (clauses.length === 1) Object.assign(filter, clauses[0]);
  if (clauses.length > 1) filter.$and = clauses;

  return {
    filter,
    sort: TRACK_SORTS.has(query.sort) ? query.sort : "popularity",
    limit: readPageSize(query.limit),
  };
}

export function decodeCursor(value) {
  if (typeof value !== "string" || !value || value.length > 512) return null;

  try {
    const cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    return cursor && typeof cursor === "object" && !Array.isArray(cursor) ? cursor : null;
  } catch {
    return null;
  }
}

export function encodeCursor(cursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function getTrackSort(sort) {
  return sort === "newest" ? { createdAt: -1, _id: 1 } : { popularity: -1, _id: 1 };
}

export function buildTrackCursorFilter(sort, cursor) {
  if (!cursor || cursor.sort !== sort || !ObjectId.isValid(cursor.id)) return null;
  const id = new ObjectId(cursor.id);

  if (sort === "newest") {
    const createdAt = new Date(cursor.value);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { $or: [{ createdAt: { $lt: createdAt } }, { createdAt, _id: { $gt: id } }] };
  }

  const popularity = Number(cursor.value);
  if (!Number.isFinite(popularity)) return null;
  return { $or: [{ popularity: { $lt: popularity } }, { popularity, _id: { $gt: id } }] };
}

export function createTrackCursor(sort, track) {
  if (!track?._id) return null;
  const value = sort === "newest" ? new Date(track.createdAt).toISOString() : Number(track.popularity || 0);
  return encodeCursor({ sort, id: track._id.toString(), value });
}

export function combineFilters(...filters) {
  const nonEmpty = filters.filter((filter) => filter && Object.keys(filter).length > 0);
  if (nonEmpty.length === 0) return {};
  if (nonEmpty.length === 1) return nonEmpty[0];
  return { $and: nonEmpty };
}