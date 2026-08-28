const qualityKeys = ["low", "medium", "high", "ultra"];
const generatedMediaVersion = "2";

function valueOrNull(value) {
  return typeof value === "string" && value ? value : null;
}

function serializeMediaUrl(value) {
  const url = valueOrNull(value);
  if (!url || !url.startsWith("/api/media/")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}v=${generatedMediaVersion}`;
}

function serializeAudioSources(audioSources) {
  if (!audioSources || typeof audioSources !== "object" || Array.isArray(audioSources)) return {};
  return Object.fromEntries(qualityKeys.map((quality) => [quality, serializeMediaUrl(audioSources[quality])]).filter(([, url]) => url));
}

export function serializeTrack(track) {
  if (!track) return null;
  const audioSources = serializeAudioSources(track.audioSources);

  return {
    id: track._id.toString(),
    provider: valueOrNull(track.provider),
    spotifyId: valueOrNull(track.spotifyId),
    spotifyUrl: valueOrNull(track.spotifyUrl),
    title: track.title,
    artistId: track.artistId?.toString() || null,
    artistName: track.artistName,
    albumName: track.albumName,
    albumId: track.albumId?.toString() || null,
    coverUrl: valueOrNull(track.coverUrl),
    audioUrl: serializeMediaUrl(track.audioUrl) || audioSources.high || audioSources.medium || audioSources.low || null,
    audioSources,
    videoUrl: valueOrNull(track.videoUrl),
    captionUrl: valueOrNull(track.captionUrl),
    durationSec: Number(track.durationSec) || 0,
    genres: Array.isArray(track.genres) ? track.genres : [],
    releaseYear: Number(track.releaseYear) || null,
    releaseDate: track.releaseDate || null,
    popularity: Number(track.popularity) || 0,
    styleTags: Array.isArray(track.styleTags) ? track.styleTags : [],
    albumOrder: Number.isInteger(track.albumOrder) ? track.albumOrder : null,
    lyricsText: valueOrNull(track.lyricsText),
    lyricsByTimestamp: Array.isArray(track.lyricsByTimestamp) ? track.lyricsByTimestamp : [],
  };
}

export function serializeArtist(artist, extras = {}) {
  if (!artist) return null;

  return {
    id: artist._id.toString(),
    name: artist.name,
    genres: Array.isArray(artist.genres) ? artist.genres : [],
    bio: valueOrNull(artist.bio),
    avatarUrl: valueOrNull(artist.avatarUrl),
    followerCount: Number(extras.followerCount ?? artist.followerCount) || 0,
    albumCount: Number(extras.albumCount) || 0,
    isFollowed: Boolean(extras.isFollowed),
  };
}

export function serializeAlbum(album, extras = {}) {
  if (!album) return null;

  return {
    id: album._id.toString(),
    title: album.title,
    artistId: album.artistId?.toString() || null,
    artistName: album.artistName,
    coverUrl: valueOrNull(album.coverUrl),
    genres: Array.isArray(album.genres) ? album.genres : [],
    releaseYear: Number(album.releaseYear) || null,
    releaseDate: album.releaseDate || null,
    description: valueOrNull(album.description),
    trackCount: Number(extras.trackCount) || 0,
    isSaved: Boolean(extras.isSaved),
  };
}

export function serializeUser(user) {
  if (!user) return null;

  return {
    id: user._id.toString(),
    displayName: user.displayName,
    email: user.email,
    avatarUrl: valueOrNull(user.avatarUrl),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    settings: user.settings || {},
    tasteProfile: user.tasteProfile || { topGenres: [], topArtists: [], lastUpdatedAt: null },
  };
}

export function serializePlaylist(playlist, itemCount = 0, extras = {}) {
  if (!playlist) return null;

  return {
    id: playlist._id.toString(),
    ownerId: playlist.ownerId?.toString() || null,
    name: playlist.name,
    description: playlist.description || "",
    isPublic: Boolean(playlist.isPublic),
    type: playlist.type || "user",
    systemType: playlist.systemType || null,
    coverUrl: valueOrNull(playlist.coverUrl),
    createdAt: playlist.createdAt,
    updatedAt: playlist.updatedAt,
    itemCount: Number(itemCount) || 0,
    isOwner: Boolean(extras.isOwner),
    isFollowed: Boolean(extras.isFollowed),
    followerCount: Number(extras.followerCount) || 0,
  };
}