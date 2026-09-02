import { requestJson } from "@/services/http";
import { toUserError } from "@/utils/userError";

function failureResponse(error, title, message) {
  const normalized = toUserError(error);
  const userError = normalized.code === "UNAUTHORIZED"
    ? toUserError({ code: "UNAUTHORIZED", status: normalized.status })
    : toUserError(error, { title, message });
  return {
    success: false,
    code: userError.code,
    title: userError.title,
    message: userError.message,
    retryable: userError.retryable,
    action: userError.action,
    status: userError.status,
    retryAfter: userError.retryAfter,
  };
}

async function playlistRequest(url, options, fallback) {
  try {
    const data = await requestJson(url, {
      ...options,
      fallbackTitle: fallback.title,
      fallbackMessage: fallback.message,
    });
    if (!data || typeof data !== "object") {
      throw toUserError(null, fallback);
    }
    if (data.success === false) {
      return failureResponse(
        { code: data.code, status: data.status },
        fallback.title,
        fallback.message,
      );
    }
    return data;
  } catch (error) {
    return failureResponse(error, fallback.title, fallback.message);
  }
}

// create playlist
export async function createPlaylist(name, extra = {}) {
  return playlistRequest(
    "/api/userPlaylists",
    { method: "POST", body: { name, ...extra } },
    {
      title: "Playlist not created",
      message: "We couldn’t create that playlist. Please try again.",
    },
  );
}

// get user playlists
export async function getUserPlaylists() {
  return playlistRequest(
    "/api/userPlaylists",
    { method: "GET" },
    {
      title: "Playlists unavailable",
      message: "We couldn’t load your playlists. Please try again.",
    },
  );
}

// delete playlist
export async function deletePlaylist(id) {
  return playlistRequest(
    "/api/userPlaylists",
    { method: "DELETE", body: { playlistId: id } },
    {
      title: "Playlist not deleted",
      message: "We couldn’t delete that playlist. Please try again.",
    },
  );
}

// update playlist settings or collaborators
export async function updatePlaylist(playlistId, action, value) {
  const payload = action === "addCollaborator"
    ? { playlistId, action, email: value }
    : { playlistId, action, value };
  return playlistRequest(
    "/api/userPlaylists",
    { method: "PATCH", body: payload },
    {
      title: "Playlist not updated",
      message: "We couldn’t update that playlist. Please try again.",
    },
  );
}

export async function togglePlaylistLike(playlistId) {
  return playlistRequest(
    "/api/userPlaylists/like",
    { method: "POST", body: { playlistId } },
    {
      title: "Like not updated",
      message: "We couldn’t update that playlist like. Please try again.",
    },
  );
}

// add song to playlist
export async function addSongToPlaylist(playlistID, song) {
  return playlistRequest(
    "/api/userPlaylists/songs",
    { method: "POST", body: { playlistID, song } },
    {
      title: "Song not added",
      message: "We couldn’t add that song to the playlist. Please try again.",
    },
  );
}

// delete song from playlist
export async function deleteSongFromPlaylist(playlistID, song) {
  return playlistRequest(
    "/api/userPlaylists/songs",
    { method: "DELETE", body: { playlistID, song } },
    {
      title: "Song not removed",
      message: "We couldn’t remove that song from the playlist. Please try again.",
    },
  );
}

// get single playlist by id
export async function getSinglePlaylist(id) {
  return playlistRequest(
    `/api/userPlaylists/songs?playlist=${encodeURIComponent(id || "")}`,
    { method: "GET" },
    {
      title: "Playlist unavailable",
      message: "We couldn’t load this playlist. Please try again.",
    },
  );
}
