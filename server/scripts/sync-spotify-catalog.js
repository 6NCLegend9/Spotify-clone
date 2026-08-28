import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getDatabase } from "../db/connection.js";
import { COLLECTIONS } from "../db/collections.js";
import { getSpotifyArtist, searchSpotifyTracks } from "../lib/spotify.js";

const envPath = process.env.DOTENV_CONFIG_PATH || resolve(dirname(fileURLToPath(import.meta.url)), "../../.env");
dotenv.config({ path: envPath });

const catalogQueries = [
  { query: "pop", genres: ["Pop"] },
  { query: "hip hop", genres: ["Hip-Hop"] },
  { query: "rock", genres: ["Rock"] },
  { query: "electronic", genres: ["Electronic"] },
  { query: "indie", genres: ["Indie"] },
  { query: "latin", genres: ["Latin"] },
  { query: "jazz", genres: ["Jazz"] },
  { query: "classical", genres: ["Classical"] },
  { query: "new music", genres: [] },
  { query: "top hits", genres: [] },
];
const targetTrackCount = 240;

function spotifyImage(images) {
  if (!Array.isArray(images)) return "";
  return images.find((image) => typeof image?.url === "string" && image.url)?.url || "";
}

function releaseDate(value) {
  if (typeof value !== "string" || !/^\d{4}(?:-\d{2})?(?:-\d{2})?$/.test(value)) return null;
  const normalized = value.length === 4 ? `${value}-01-01` : value.length === 7 ? `${value}-01` : value;
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function releaseYear(value) {
  return typeof value === "string" && /^\d{4}/.test(value) ? Number(value.slice(0, 4)) : null;
}

function normalizedTrackText(value) {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, " ") : "";
}

function trackIdentity(track) {
  return [
    normalizedTrackText(track.name),
    (track.artists || []).map((artist) => artist?.id || normalizedTrackText(artist?.name)).join("|"),
    normalizedTrackText(track.album?.name),
    Math.round(Number(track.duration_ms) || 0),
  ].join("\u0001");
}

function chunk(values, size) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

async function collectTracks() {
  const tracksByIdentity = new Map();
  for (let offset = 0; offset < 100; offset += 10) {
    for (const source of catalogQueries) {
      const payload = await searchSpotifyTracks(source.query, 10, offset);
      const items = Array.isArray(payload.tracks?.items) ? payload.tracks.items : [];
      for (const track of items) {
        if (!track?.id || !track.name || !track.album?.id || !Array.isArray(track.artists) || !track.artists.length) continue;
        const identity = trackIdentity(track);
        const existing = tracksByIdentity.get(identity);
        const catalogGenres = [...new Set([...(existing?.catalogGenres || []), ...source.genres])];
        tracksByIdentity.set(identity, { ...(existing || track), catalogGenres });
        if (tracksByIdentity.size >= targetTrackCount) return [...tracksByIdentity.values()];
      }
      if (items.length < 10) break;
    }
  }
  return [...tracksByIdentity.values()];
}

async function loadArtistDetails(tracks) {
  const ids = new Set();
  tracks.forEach((track) => {
    [...(track.artists || []), ...(track.album?.artists || [])].forEach((artist) => {
      if (typeof artist?.id === "string" && artist.id) ids.add(artist.id);
    });
  });

  const details = new Map();
  for (const idsBatch of chunk([...ids], 6)) {
    const results = await Promise.allSettled(idsBatch.map((artistId) => getSpotifyArtist(artistId)));
    results.forEach((result) => {
      if (result.status === "fulfilled" && result.value?.id) details.set(result.value.id, result.value);
    });
  }
  return details;
}

async function dropLegacyNameIndex(db) {
  try {
    await db.collection(COLLECTIONS.artists).dropIndex("name_1");
  } catch (error) {
    if (error.codeName !== "IndexNotFound" && error.code !== 27) throw error;
  }
}

async function createSpotifyIndexes(db) {
  await dropLegacyNameIndex(db);
  await Promise.all([
    db.collection(COLLECTIONS.artists).createIndex({ spotifyId: 1 }, { unique: true, sparse: true }),
    db.collection(COLLECTIONS.albums).createIndex({ spotifyId: 1 }, { unique: true, sparse: true }),
    db.collection(COLLECTIONS.tracks).createIndex({ spotifyId: 1 }, { unique: true, sparse: true }),
  ]);
}

async function removeSyntheticCatalog(db) {
  const [tracks, playlists] = await Promise.all([
    db.collection(COLLECTIONS.tracks).find({ seedVersion: { $exists: true } }, { projection: { _id: 1 } }).toArray(),
    db.collection(COLLECTIONS.playlists).find({ seedVersion: { $exists: true } }, { projection: { _id: 1 } }).toArray(),
  ]);
  const trackIds = tracks.map((track) => track._id);
  const playlistIds = playlists.map((playlist) => playlist._id);

  if (trackIds.length) {
    await Promise.all([
      db.collection(COLLECTIONS.likes).deleteMany({ trackId: { $in: trackIds } }),
      db.collection(COLLECTIONS.playlistItems).deleteMany({ trackId: { $in: trackIds } }),
      db.collection(COLLECTIONS.listeningEvents).deleteMany({ trackId: { $in: trackIds } }),
      db.collection(COLLECTIONS.recommendationHistory).deleteMany({ trackId: { $in: trackIds } }),
      db.collection(COLLECTIONS.radioQueueItems).deleteMany({ trackId: { $in: trackIds } }),
    ]);
  }
  if (playlistIds.length) {
    await Promise.all([
      db.collection(COLLECTIONS.playlistItems).deleteMany({ playlistId: { $in: playlistIds } }),
      db.collection(COLLECTIONS.followedPlaylists).deleteMany({ playlistId: { $in: playlistIds } }),
      db.collection(COLLECTIONS.playlists).deleteMany({ _id: { $in: playlistIds } }),
    ]);
  }

  await Promise.all([
    db.collection(COLLECTIONS.artists).deleteMany({ seedVersion: { $exists: true } }),
    db.collection(COLLECTIONS.albums).deleteMany({ seedVersion: { $exists: true } }),
    db.collection(COLLECTIONS.tracks).deleteMany({ seedVersion: { $exists: true } }),
    db.collection(COLLECTIONS.recommendations).deleteMany({}),
    db.collection(COLLECTIONS.recommendationHistory).deleteMany({}),
    db.collection(COLLECTIONS.chartSnapshots).deleteMany({}),
  ]);
}

async function removeStaleSpotifyCatalog(db, tracks) {
  const trackSpotifyIds = tracks.map((track) => track.id);
  const albumSpotifyIds = [...new Set(tracks.map((track) => track.album?.id).filter(Boolean))];
  const artistSpotifyIds = [...new Set(tracks.flatMap((track) => [...(track.artists || []), ...(track.album?.artists || [])].map((artist) => artist?.id).filter(Boolean)))];
  const [staleTracks, staleAlbums, staleArtists] = await Promise.all([
    db.collection(COLLECTIONS.tracks).find({ provider: "spotify", spotifyId: { $nin: trackSpotifyIds } }, { projection: { _id: 1 } }).toArray(),
    db.collection(COLLECTIONS.albums).find({ provider: "spotify", spotifyId: { $nin: albumSpotifyIds } }, { projection: { _id: 1 } }).toArray(),
    db.collection(COLLECTIONS.artists).find({ provider: "spotify", spotifyId: { $nin: artistSpotifyIds } }, { projection: { _id: 1 } }).toArray(),
  ]);
  const staleTrackIds = staleTracks.map((track) => track._id);
  const staleAlbumIds = staleAlbums.map((album) => album._id);
  const staleArtistIds = staleArtists.map((artist) => artist._id);

  await Promise.all([
    staleTrackIds.length ? db.collection(COLLECTIONS.likes).deleteMany({ trackId: { $in: staleTrackIds } }) : null,
    staleTrackIds.length ? db.collection(COLLECTIONS.playlistItems).deleteMany({ trackId: { $in: staleTrackIds } }) : null,
    staleTrackIds.length ? db.collection(COLLECTIONS.listeningEvents).deleteMany({ trackId: { $in: staleTrackIds } }) : null,
    staleTrackIds.length ? db.collection(COLLECTIONS.recommendationHistory).deleteMany({ trackId: { $in: staleTrackIds } }) : null,
    staleTrackIds.length ? db.collection(COLLECTIONS.radioQueueItems).deleteMany({ trackId: { $in: staleTrackIds } }) : null,
    staleAlbumIds.length ? db.collection(COLLECTIONS.savedAlbums).deleteMany({ albumId: { $in: staleAlbumIds } }) : null,
    staleArtistIds.length ? db.collection(COLLECTIONS.followedArtists).deleteMany({ artistId: { $in: staleArtistIds } }) : null,
  ]);
  await Promise.all([
    staleTrackIds.length ? db.collection(COLLECTIONS.tracks).deleteMany({ _id: { $in: staleTrackIds } }) : null,
    staleAlbumIds.length ? db.collection(COLLECTIONS.albums).deleteMany({ _id: { $in: staleAlbumIds } }) : null,
    staleArtistIds.length ? db.collection(COLLECTIONS.artists).deleteMany({ _id: { $in: staleArtistIds } }) : null,
  ]);
}

async function syncCatalog() {
  const db = await getDatabase();
  const now = new Date();
  const tracks = await collectTracks();
  if (tracks.length < 40) throw new Error("Spotify did not return enough tracks to create a catalog");
  const artistDetails = await loadArtistDetails(tracks);
  const artistRecords = new Map();
  const discoveryGenresByArtistId = new Map();

  tracks.forEach((track) => {
    [...(track.artists || []), ...(track.album?.artists || [])].forEach((artist) => {
      if (!artist?.id || !artist?.name) return;
      artistRecords.set(artist.id, artist);
      discoveryGenresByArtistId.set(artist.id, [...new Set([...(discoveryGenresByArtistId.get(artist.id) || []), ...(track.catalogGenres || [])])]);
    });
  });

  await createSpotifyIndexes(db);
  await db.collection(COLLECTIONS.artists).bulkWrite([...artistRecords.values()].map((artist) => {
    const detail = artistDetails.get(artist.id) || artist;
    return {
      updateOne: {
        filter: { spotifyId: artist.id },
        update: {
          $set: {
            provider: "spotify",
            spotifyId: artist.id,
            spotifyUrl: detail.external_urls?.spotify || `https://open.spotify.com/artist/${artist.id}`,
            name: detail.name || artist.name,
            genres: Array.isArray(detail.genres) && detail.genres.length ? detail.genres : discoveryGenresByArtistId.get(artist.id) || [],
            avatarUrl: spotifyImage(detail.images),
            followerCount: Number(detail.followers?.total) || 0,
            bio: "",
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        upsert: true,
      },
    };
  }));

  const savedArtists = await db.collection(COLLECTIONS.artists).find({ spotifyId: { $in: [...artistRecords.keys()] } }).toArray();
  const artistsBySpotifyId = new Map(savedArtists.map((artist) => [artist.spotifyId, artist]));
  const spotifyAlbumsById = new Map();
  tracks.forEach((track) => {
    if (track.album?.id) spotifyAlbumsById.set(track.album.id, track.album);
  });

  await db.collection(COLLECTIONS.albums).bulkWrite([...spotifyAlbumsById.values()].map((album) => {
    const artist = artistsBySpotifyId.get(album.artists?.[0]?.id);
    const artistDetail = artistDetails.get(album.artists?.[0]?.id);
    return {
      updateOne: {
        filter: { spotifyId: album.id },
        update: {
          $set: {
            provider: "spotify",
            spotifyId: album.id,
            spotifyUrl: album.external_urls?.spotify || `https://open.spotify.com/album/${album.id}`,
            title: album.name,
            artistId: artist?._id || null,
            artistName: album.artists?.[0]?.name || "Spotify artist",
            coverUrl: spotifyImage(album.images),
            genres: Array.isArray(artistDetail?.genres) ? artistDetail.genres : [],
            releaseYear: releaseYear(album.release_date),
            releaseDate: releaseDate(album.release_date),
            description: "",
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        upsert: true,
      },
    };
  }));

  const savedAlbums = await db.collection(COLLECTIONS.albums).find({ spotifyId: { $in: [...spotifyAlbumsById.keys()] } }).toArray();
  const savedAlbumsBySpotifyId = new Map(savedAlbums.map((album) => [album.spotifyId, album]));
  await db.collection(COLLECTIONS.tracks).bulkWrite(tracks.map((track) => {
    const primaryArtist = artistsBySpotifyId.get(track.artists?.[0]?.id);
    const album = savedAlbumsBySpotifyId.get(track.album?.id);
    const artistGenres = primaryArtist?.genres?.length ? primaryArtist.genres : artistDetails.get(track.artists?.[0]?.id)?.genres?.length ? artistDetails.get(track.artists?.[0]?.id).genres : track.catalogGenres || [];
    return {
      updateOne: {
        filter: { spotifyId: track.id },
        update: {
          $set: {
            provider: "spotify",
            spotifyId: track.id,
            spotifyUrl: track.external_urls?.spotify || `https://open.spotify.com/track/${track.id}`,
            catalogKey: `spotify:${track.id}`,
            title: track.name,
            artistId: primaryArtist?._id || null,
            artistName: track.artists?.map((artist) => artist.name).filter(Boolean).join(", ") || "Spotify artist",
            albumId: album?._id || null,
            albumName: track.album?.name || "Spotify album",
            coverUrl: spotifyImage(track.album?.images),
            audioUrl: null,
            audioSources: {},
            videoUrl: null,
            captionUrl: null,
            durationSec: Math.max(1, Math.round((Number(track.duration_ms) || 0) / 1000)),
            genres: Array.isArray(artistGenres) ? artistGenres : [],
            releaseYear: releaseYear(track.album?.release_date),
            releaseDate: releaseDate(track.album?.release_date),
            popularity: Number(track.popularity) || 0,
            styleTags: [],
            albumOrder: Number.isInteger(track.track_number) ? track.track_number : null,
            lyricsText: null,
            lyricsByTimestamp: [],
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        upsert: true,
      },
    };
  }));

  await removeStaleSpotifyCatalog(db, tracks);
  await removeSyntheticCatalog(db);
  console.log(`Synced ${tracks.length} real Spotify tracks, ${artistRecords.size} artists, and ${savedAlbumsBySpotifyId.size} albums.`);
}

syncCatalog()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Spotify catalog sync failed:", error.message);
    process.exit(1);
  });