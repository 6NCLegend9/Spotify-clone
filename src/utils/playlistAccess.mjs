function identity(value) {
  return value == null ? "" : String(value._id ?? value);
}

export function canEditPlaylist(playlist, userId) {
  const id = identity(userId);
  return Boolean(id && playlist && (identity(playlist.user) === id
    || playlist.collaborators?.some((collaborator) => identity(collaborator) === id)));
}

export function canViewPlaylist(playlist, userId) {
  return Boolean(playlist && (playlist.visibility === "public" || canEditPlaylist(playlist, userId)));
}

export function libraryPlaylistFilter(userId, likedPlaylists = []) {
  if (!identity(userId)) return { _id: { $in: [] } };
  return {
    $or: [
      { user: userId },
      { collaborators: userId },
      { _id: { $in: Array.isArray(likedPlaylists) ? likedPlaylists : [] }, visibility: "public" },
    ],
  };
}