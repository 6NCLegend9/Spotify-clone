import { requestJson } from "@/services/http";
import { toUserError } from "@/utils/userError";

function mutationFailure(error, fallback) {
  const normalized = toUserError(error);
  const userError = normalized.code === "UNAUTHORIZED"
    ? toUserError({ code: "UNAUTHORIZED", status: normalized.status })
    : toUserError(error, fallback);
  return {
    success: false,
    code: userError.code,
    title: userError.title,
    message: userError.message,
    retryable: userError.retryable,
    action: userError.action,
    status: userError.status,
  };
}

// home page data
export async function homePageData(language) {
  return null;
}

// get song data
export async function getSongData(id) {
  return null;
}

// get album data
export async function getAlbumData(id) {
  return null;
}

// get playlist data
export async function getplaylistData(id) {
  return null;
}

// get Lyrics data
export async function getlyricsData(lyricsId) {
  return null;
}

// get artist data
export async function getArtistData(id) {
  return null;
}

// get artist songs
export async function getArtistSongs(id, page) {
  return [];
}

// get artist albums
export async function getArtistAlbums(id, page) {
  return [];
}

// get search data
export async function getSearchedData(query) {
  return { songs: { results: [] }, albums: [], artists: [], playlists: [] };
}

// add and remove from favourite
export async function addFavourite(id) {
  try {
    const data = await requestJson("/api/favourite", {
      method: "POST",
      body: id,
      fallbackTitle: "Liked Songs not updated",
      fallbackMessage: "We couldn’t update your Liked Songs. Please try again.",
    });
    if (!data || typeof data !== "object") {
      throw toUserError(null, {
        title: "Liked Songs not updated",
        message: "We couldn’t update your Liked Songs. Please try again.",
      });
    }
    if (data.success === false) {
      return mutationFailure({ code: data.code, status: data.status }, {
        title: "Liked Songs not updated",
        message: "We couldn’t update your Liked Songs. Please try again.",
      });
    }
    return data;
  } catch (error) {
    return mutationFailure(error, {
      title: "Liked Songs not updated",
      message: "We couldn’t update your Liked Songs. Please try again.",
    });
  }
}

// get favourite
export async function getFavourite() {
  const fallback = {
    title: "Liked Songs unavailable",
    message: "We couldn’t load your Liked Songs. Please try again.",
  };
  try {
    const data = await requestJson("/api/favourite", {
      fallbackTitle: fallback.title,
      fallbackMessage: fallback.message,
    });
    if (!data?.data || !Array.isArray(data.data.favourites)) {
      throw toUserError(null, fallback);
    }
    return data.data.favourites;
  } catch (error) {
    const normalized = toUserError(error);
    throw normalized.code === "UNAUTHORIZED"
      ? toUserError({ code: "UNAUTHORIZED", status: normalized.status })
      : toUserError(error, fallback);
  }
}

// user info
export async function getUserInfo() {
  try {
    const data = await requestJson("/api/userInfo", {
      fallbackTitle: "Profile unavailable",
      fallbackMessage: "We couldn’t load your profile. Please try again.",
    });
    return data?.data && typeof data.data === "object" ? data.data : null;
  } catch {
    return null;
  }
}

// reset password
export async function resetPassword(password, confirmPassword, token) {
  return requestJson("/api/forgotPassword", {
    method: "PUT",
    body: { password, confirmPassword, token },
    fallbackTitle: "Couldn't reset password",
    fallbackMessage: "We couldn't reset your password. Please try again.",
  });
}

// send reset password link
export async function sendResetPasswordLink(email) {
  return requestJson("/api/forgotPassword", {
    method: "POST",
    body: { email },
    fallbackTitle: "Couldn't send link",
    fallbackMessage: "We couldn't send a reset link. Please try again.",
  });
}

// get  recommended songs
export async function getRecommendedSongs(artistId, songId) {
  return [];
}
