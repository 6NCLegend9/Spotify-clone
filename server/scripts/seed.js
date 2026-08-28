import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getDatabase } from "../db/connection.js";
import { COLLECTIONS } from "../db/collections.js";
import { createDefaultSettings } from "../routes/auth.js";

const envPath = process.env.DOTENV_CONFIG_PATH || resolve(dirname(fileURLToPath(import.meta.url)), "../../.env");
dotenv.config({ path: envPath });

const seedVersion = 3;
const syntheticDurationSeconds = 8;
const catalogCounts = { artists: 90, albums: 120, tracks: 360, playlists: 60 };
const genres = ["Alternative", "Ambient", "Classical", "Dance", "Electronic", "Folk", "Hip-Hop", "Indie", "Jazz", "Latin", "Pop", "R&B", "Rap", "Rock", "Soul", "Synthwave", "World", "Focus"];
const artistFirstNames = ["Ari", "Mara", "Sol", "Niko", "Iris", "Jules", "Cleo", "Theo", "Sage", "Rin", "Noa", "Avery"];
const artistLastNames = ["Vale", "Rowan", "Kite", "Bloom", "North", "Wren", "River", "Morrow", "Lumen", "Ash", "Haze", "Vega"];
const adjectives = ["After", "Amber", "Blue", "Bright", "Cloud", "Echo", "Golden", "Hidden", "Late", "Little", "Lunar", "Neon", "Quiet", "Silver", "Slow", "Soft", "Static", "Velvet", "Warm", "Wild"];
const nouns = ["Arcade", "Bloom", "Current", "Daylight", "Echo", "Garden", "Horizon", "Lantern", "Memory", "Motive", "Night", "Orbit", "Parade", "Signal", "Sky", "Street", "Summer", "Tide", "Window", "World"];
const styleTags = ["bright", "driving", "dreamy", "late-night", "percussive", "warm", "restless", "soft-focus", "wide-screen", "club", "acoustic", "kinetic"];
const coverUrls = [
	"https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&q=80",
	"https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=800&q=80",
	"https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&q=80",
	"https://images.unsplash.com/photo-1519608487953-e999c86e7455?w=800&q=80",
	"https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?w=800&q=80",
	"https://images.unsplash.com/photo-1506157786151-b8491531f063?w=800&q=80",
];

function artistsForSeed() {
	return Array.from({ length: catalogCounts.artists }, (_, index) => {
		const name = `${artistFirstNames[index % artistFirstNames.length]} ${artistLastNames[Math.floor(index / artistFirstNames.length) % artistLastNames.length]}`;
		const primaryGenre = genres[index % genres.length];
		const secondaryGenre = genres[(index * 5 + 3) % genres.length];
		return {
			seedKey: `artist-${index + 1}`,
			seedVersion,
			name,
			genres: primaryGenre === secondaryGenre ? [primaryGenre] : [primaryGenre, secondaryGenre],
			bio: `${name} makes fictional ${primaryGenre.toLocaleLowerCase()} recordings for the Musicon demo catalog.`,
			avatarUrl: coverUrls[index % coverUrls.length],
			followerCount: 1200 + ((index * 173) % 88000),
		};
	});
}

function albumsForSeed(artists, now) {
	return Array.from({ length: catalogCounts.albums }, (_, index) => {
		const artist = artists[index % artists.length];
		const releaseDate = new Date(now.getTime() - index * 86400000 * 9);
		return {
			seedKey: `album-${index + 1}`,
			seedVersion,
			title: `${adjectives[index % adjectives.length]} ${nouns[(index * 3) % nouns.length]} Studies, Vol. ${Math.floor(index / 12) + 1}`,
			artistId: artist._id,
			artistName: artist.name,
			coverUrl: coverUrls[(index * 3) % coverUrls.length],
			genres: artist.genres,
			releaseYear: releaseDate.getUTCFullYear(),
			releaseDate,
			description: `A fictional ${artist.genres[0].toLocaleLowerCase()} release by ${artist.name}.`,
			createdAt: releaseDate,
		};
	});
}

function mediaUrl(catalogKey, quality) {
	return `/api/media/${catalogKey}?quality=${quality}`;
}

function tracksForSeed(albums, now) {
	return Array.from({ length: catalogCounts.tracks }, (_, index) => {
		const album = albums[Math.floor(index / 3)];
		const title = `${adjectives[index % adjectives.length]} ${nouns[Math.floor(index / adjectives.length) % nouns.length]}`;
		const createdAt = new Date(now.getTime() - index * 86400000);
		const catalogKey = `track-${index + 1}`;
		const audioSources = {
			low: mediaUrl(catalogKey, "low"),
			medium: mediaUrl(catalogKey, "medium"),
			high: mediaUrl(catalogKey, "high"),
			ultra: mediaUrl(catalogKey, "ultra"),
		};

		return {
			catalogKey,
			seedVersion,
			title,
			artistId: album.artistId,
			artistName: album.artistName,
			albumName: album.title,
			albumId: album._id,
			coverUrl: album.coverUrl,
			audioUrl: audioSources.high,
			audioSources,
			durationSec: syntheticDurationSeconds,
			genres: album.genres,
			releaseYear: album.releaseYear,
			releaseDate: album.releaseDate,
			popularity: 35 + ((index * 17) % 66),
			styleTags: [styleTags[index % styleTags.length], styleTags[(index * 5 + 2) % styleTags.length]],
			albumOrder: (index % 3) + 1,
			lyricsText: `A small light moves across the room.\nThe city turns, the colors bloom.\nWe keep the rhythm soft and clear.\nA new beginning settles here.`,
			lyricsByTimestamp: [
				{ startSec: 0, text: "A small light moves across the room." },
				{ startSec: 2, text: "The city turns, the colors bloom." },
				{ startSec: 4, text: "We keep the rhythm soft and clear." },
				{ startSec: 6, text: "A new beginning settles here." },
			],
			createdAt,
		};
	});
}

function playlistsForSeed(now, demoUserId, catalogUserId) {
	return Array.from({ length: catalogCounts.playlists }, (_, index) => {
		const isOwnedByDemo = index < 36;
		const isFavorite = isOwnedByDemo && index < 3;
		return {
			seedKey: `playlist-${index + 1}`,
			seedVersion,
			ownerId: isOwnedByDemo ? demoUserId : catalogUserId,
			name: isFavorite ? `Favorites ${index + 1}` : `${adjectives[index % adjectives.length]} ${genres[index % genres.length]}`,
			description: isFavorite ? "An unlimited personal favorites collection." : `A fictional ${genres[index % genres.length].toLocaleLowerCase()} collection for the Musicon demo.`,
			isPublic: !isOwnedByDemo || index % 4 === 0,
			type: isFavorite ? "favorites" : "user",
			coverUrl: coverUrls[index % coverUrls.length],
			followerCount: isOwnedByDemo ? 0 : 900 + ((index * 97) % 14000),
			createdAt: new Date(now.getTime() - index * 43200000),
			updatedAt: now,
		};
	});
}

async function createIndexes(db) {
	await Promise.all([
		db.collection(COLLECTIONS.users).createIndex({ email: 1 }, { unique: true }),
		db.collection(COLLECTIONS.users).createIndex({ "tasteProfile.lastUpdatedAt": 1 }),
		db.collection(COLLECTIONS.tracks).createIndex({ title: 1 }),
		db.collection(COLLECTIONS.tracks).createIndex({ artistName: 1 }),
		db.collection(COLLECTIONS.tracks).createIndex({ genres: 1 }),
		db.collection(COLLECTIONS.tracks).createIndex({ popularity: -1 }),
		db.collection(COLLECTIONS.tracks).createIndex({ createdAt: -1 }),
		db.collection(COLLECTIONS.tracks).createIndex({ seedVersion: 1, catalogKey: 1 }),
		db.collection(COLLECTIONS.tracks).createIndex({ artistId: 1, popularity: -1 }),
		db.collection(COLLECTIONS.tracks).createIndex({ albumId: 1, albumOrder: 1 }),
		db.collection(COLLECTIONS.artists).createIndex({ name: 1 }, { unique: true }),
		db.collection(COLLECTIONS.artists).createIndex({ seedVersion: 1, seedKey: 1 }),
		db.collection(COLLECTIONS.albums).createIndex({ title: 1 }),
		db.collection(COLLECTIONS.albums).createIndex({ artistId: 1, releaseDate: -1 }),
		db.collection(COLLECTIONS.albums).createIndex({ seedVersion: 1, seedKey: 1 }),
		db.collection(COLLECTIONS.playlists).createIndex({ ownerId: 1, createdAt: -1 }),
		db.collection(COLLECTIONS.playlists).createIndex({ isPublic: 1 }),
		db.collection(COLLECTIONS.playlistItems).createIndex({ playlistId: 1, trackId: 1 }, { unique: true }),
		db.collection(COLLECTIONS.playlistItems).createIndex({ playlistId: 1, position: 1 }),
		db.collection(COLLECTIONS.playlistItems).createIndex({ trackId: 1 }),
		db.collection(COLLECTIONS.likes).createIndex({ userId: 1, trackId: 1 }, { unique: true }),
		db.collection(COLLECTIONS.likes).createIndex({ userId: 1, likedAt: -1 }),
		db.collection(COLLECTIONS.likes).createIndex({ trackId: 1 }),
		db.collection(COLLECTIONS.followedArtists).createIndex({ userId: 1, artistId: 1 }, { unique: true }),
		db.collection(COLLECTIONS.followedArtists).createIndex({ userId: 1, followedAt: -1 }),
		db.collection(COLLECTIONS.followedPlaylists).createIndex({ userId: 1, playlistId: 1 }, { unique: true }),
		db.collection(COLLECTIONS.followedPlaylists).createIndex({ userId: 1, followedAt: -1 }),
		db.collection(COLLECTIONS.savedAlbums).createIndex({ userId: 1, albumId: 1 }, { unique: true }),
		db.collection(COLLECTIONS.savedAlbums).createIndex({ userId: 1, savedAt: -1 }),
		db.collection(COLLECTIONS.searchEvents).createIndex({ userId: 1, createdAt: -1 }),
		db.collection(COLLECTIONS.searchEvents).createIndex({ createdAt: 1 }, { expireAfterSeconds: 7776000 }),
		db.collection(COLLECTIONS.listeningEvents).createIndex({ userId: 1, playedAt: -1 }),
		db.collection(COLLECTIONS.listeningEvents).createIndex({ trackId: 1, playedAt: -1 }),
		db.collection(COLLECTIONS.listeningEvents).createIndex({ playedAt: 1 }, { expireAfterSeconds: 15552000 }),
		db.collection(COLLECTIONS.recommendations).createIndex({ userId: 1, generatedAt: -1 }),
		db.collection(COLLECTIONS.recommendations).createIndex({ userId: 1, windowType: 1, windowId: 1 }, { unique: true }),
		db.collection(COLLECTIONS.recommendationHistory).createIndex({ userId: 1, trackId: 1 }, { unique: true }),
		db.collection(COLLECTIONS.recommendationHistory).createIndex({ userId: 1, recommendedAt: -1 }),
		db.collection(COLLECTIONS.radioSessions).createIndex({ userId: 1, status: 1, updatedAt: -1 }),
		db.collection(COLLECTIONS.radioQueueItems).createIndex({ sessionId: 1, position: 1 }, { unique: true }),
		db.collection(COLLECTIONS.chartSnapshots).createIndex({ windowType: 1, windowId: 1 }, { unique: true }),
	]);
}

async function seed() {
	const db = await getDatabase();
	const now = new Date();
	await createIndexes(db);

	await db.collection(COLLECTIONS.users).updateOne(
		{ email: "demo@musicon.local" },
		{
			$setOnInsert: {
				displayName: "Demo Listener",
				email: "demo@musicon.local",
				avatarUrl: "",
				settings: createDefaultSettings(now),
				tasteProfile: { topGenres: [], topArtists: [], lastUpdatedAt: now },
				createdAt: now,
				updatedAt: now,
			},
		},
		{ upsert: true },
	);
	const demoUser = await db.collection(COLLECTIONS.users).findOne({ email: "demo@musicon.local" });
	await db.collection(COLLECTIONS.users).updateOne(
		{ email: "editorial@musicon.local" },
		{
			$setOnInsert: {
				displayName: "Musicon Editorial",
				email: "editorial@musicon.local",
				avatarUrl: "",
				settings: createDefaultSettings(now),
				tasteProfile: { topGenres: [], topArtists: [], lastUpdatedAt: now },
				createdAt: now,
				updatedAt: now,
			},
		},
		{ upsert: true },
	);
	const editorialUser = await db.collection(COLLECTIONS.users).findOne({ email: "editorial@musicon.local" });

	const artists = artistsForSeed();
	await db.collection(COLLECTIONS.artists).bulkWrite(artists.map((artist) => ({ replaceOne: { filter: { seedKey: artist.seedKey }, replacement: artist, upsert: true } })));
	const savedArtists = await db.collection(COLLECTIONS.artists).find({ seedVersion }).sort({ seedKey: 1 }).toArray();

	const albums = albumsForSeed(savedArtists, now);
	await db.collection(COLLECTIONS.albums).bulkWrite(albums.map((album) => ({ replaceOne: { filter: { seedKey: album.seedKey }, replacement: album, upsert: true } })));
	const savedAlbums = await db.collection(COLLECTIONS.albums).find({ seedVersion }).sort({ seedKey: 1 }).toArray();

	const tracks = tracksForSeed(savedAlbums, now);
	await db.collection(COLLECTIONS.tracks).bulkWrite(tracks.map((track) => ({ replaceOne: { filter: { catalogKey: track.catalogKey }, replacement: track, upsert: true } })));
	const savedTracks = await db.collection(COLLECTIONS.tracks).find({ seedVersion }).sort({ catalogKey: 1 }).toArray();

	const previousPlaylists = await db.collection(COLLECTIONS.playlists).find({ seedKey: { $exists: true } }, { projection: { _id: 1 } }).toArray();
	const systemPlaylists = await db.collection(COLLECTIONS.playlists).find({ ownerId: demoUser._id, type: "system" }, { projection: { _id: 1 } }).toArray();
	const resetPlaylists = [...previousPlaylists, ...systemPlaylists];
	if (resetPlaylists.length) await db.collection(COLLECTIONS.playlistItems).deleteMany({ playlistId: { $in: resetPlaylists.map((playlist) => playlist._id) } });
	if (previousPlaylists.length) await db.collection(COLLECTIONS.followedPlaylists).deleteMany({ playlistId: { $in: previousPlaylists.map((playlist) => playlist._id) } });
	if (systemPlaylists.length) await db.collection(COLLECTIONS.playlists).deleteMany({ _id: { $in: systemPlaylists.map((playlist) => playlist._id) } });
	const playlists = playlistsForSeed(now, demoUser._id, editorialUser._id);
	await db.collection(COLLECTIONS.playlists).bulkWrite(playlists.map((playlist) => ({ replaceOne: { filter: { seedKey: playlist.seedKey }, replacement: playlist, upsert: true } })));
	const savedPlaylists = await db.collection(COLLECTIONS.playlists).find({ seedVersion }).sort({ seedKey: 1 }).toArray();
	const playlistItems = savedPlaylists.flatMap((playlist, playlistIndex) => {
		const size = 8 + ((playlistIndex * 11) % 46);
		return Array.from({ length: size }, (_, position) => ({
			playlistId: playlist._id,
			trackId: savedTracks[(playlistIndex * 17 + position * 5) % savedTracks.length]._id,
			addedAt: new Date(now.getTime() - position * 60000),
			position,
		}));
	});
	if (playlistItems.length) await db.collection(COLLECTIONS.playlistItems).insertMany(playlistItems, { ordered: false });

	const radioSessions = await db.collection(COLLECTIONS.radioSessions).find({ userId: demoUser._id }, { projection: { _id: 1 } }).toArray();
	const preferredGenres = new Set(["Hip-Hop", "Rap", "R&B", "Electronic", "Dance", "Soul"]);
	const likedTracks = savedTracks.filter((track) => track.genres.some((genre) => preferredGenres.has(genre))).slice(0, 120);
	const followedArtists = savedArtists.filter((artist) => artist.genres.some((genre) => preferredGenres.has(genre))).slice(0, 12);
	const savedAlbumRows = savedAlbums.filter((album) => followedArtists.some((artist) => artist._id.equals(album.artistId))).slice(0, 18);
	const followedPlaylists = savedPlaylists.filter((playlist) => playlist.ownerId.equals(editorialUser._id) && playlist.isPublic).slice(0, 7);
	await Promise.all([
		db.collection(COLLECTIONS.likes).deleteMany({ userId: demoUser._id }),
		db.collection(COLLECTIONS.followedArtists).deleteMany({ userId: demoUser._id }),
		db.collection(COLLECTIONS.followedPlaylists).deleteMany({ userId: demoUser._id }),
		db.collection(COLLECTIONS.savedAlbums).deleteMany({ userId: demoUser._id }),
		db.collection(COLLECTIONS.searchEvents).deleteMany({ userId: demoUser._id }),
		db.collection(COLLECTIONS.listeningEvents).deleteMany({ userId: demoUser._id }),
		db.collection(COLLECTIONS.recommendations).deleteMany({ userId: demoUser._id }),
		db.collection(COLLECTIONS.recommendationHistory).deleteMany({ userId: demoUser._id }),
		db.collection(COLLECTIONS.radioSessions).deleteMany({ userId: demoUser._id }),
		db.collection(COLLECTIONS.chartSnapshots).deleteMany({}),
	]);
	if (radioSessions.length) await db.collection(COLLECTIONS.radioQueueItems).deleteMany({ sessionId: { $in: radioSessions.map((session) => session._id) } });
	await Promise.all([
		db.collection(COLLECTIONS.likes).insertMany(likedTracks.map((track, index) => ({ userId: demoUser._id, trackId: track._id, likedAt: new Date(now.getTime() - index * 7200000) }))),
		db.collection(COLLECTIONS.followedArtists).insertMany(followedArtists.map((artist, index) => ({ userId: demoUser._id, artistId: artist._id, followedAt: new Date(now.getTime() - index * 86400000) }))),
		db.collection(COLLECTIONS.followedPlaylists).insertMany(followedPlaylists.map((playlist, index) => ({ userId: demoUser._id, playlistId: playlist._id, followedAt: new Date(now.getTime() - index * 86400000) }))),
		db.collection(COLLECTIONS.savedAlbums).insertMany(savedAlbumRows.map((album, index) => ({ userId: demoUser._id, albumId: album._id, savedAt: new Date(now.getTime() - index * 86400000) }))),
	]);
	await db.collection(COLLECTIONS.searchEvents).insertMany(Array.from({ length: 300 }, (_, index) => {
		const track = savedTracks[(index * 9) % savedTracks.length];
		return {
			userId: demoUser._id,
			queryText: index % 2 === 0 ? track.artistName : track.genres[0],
			queryType: index % 2 === 0 ? "artist" : "genre",
			matchedGenres: track.genres,
			matchedArtists: [track.artistName],
			createdAt: new Date(now.getTime() - index * 3600000),
		};
	}));
	await db.collection(COLLECTIONS.listeningEvents).insertMany(Array.from({ length: 600 }, (_, index) => {
		const track = savedTracks[(index * 11) % savedTracks.length];
		return {
			userId: demoUser._id,
			trackId: track._id,
			playedAt: new Date(now.getTime() - index * 1800000),
			context: { type: index % 4 === 0 ? "playlist" : index % 4 === 1 ? "search" : "home" },
			positionSecAtStart: 0,
			dwellSecApprox: 1,
		};
	}));

	console.log(`Seeded ${savedTracks.length} tracks, ${savedArtists.length} artists, ${savedAlbums.length} albums, ${savedPlaylists.length} playlists, ${playlistItems.length} playlist items, ${likedTracks.length} likes, 300 searches, and 600 listening events.`);
}

seed()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("Seed failed:", error.message);
		process.exit(1);
	});
