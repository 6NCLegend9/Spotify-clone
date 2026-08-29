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
    const response = await fetch("/api/favourite", {
      method: "POST",
      body: JSON.stringify(id),
      headers: {
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data;
  } catch (error) {
    console.log("Add favourite API error", error);
    return null;
  }
}

// get favourite
export async function getFavourite() {
  try {
    const response = await fetch("/api/favourite");
    if (!response.ok) return null;
    const data = await response.json();
    return data?.data?.favourites;
  } catch (error) {
    console.log("Get favourite API error", error);
    return null;
  }
}

// user info
export async function getUserInfo() {
  try {
    const response = await fetch("/api/userInfo");
    if (!response.ok) return null;
    const data = await response.json();
    return data?.data;
  } catch (error) {
    console.log("Get user info API error", error);
    return null;
  }
}

// reset password
export async function resetPassword(password, confirmPassword, token) {
  try {
    const response = await fetch("/api/forgotPassword", {
      method: "PUT",
      body: JSON.stringify({ password, confirmPassword, token }),
      headers: {
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data;
  } catch (error) {
    console.log("Reset password API error", error);
    return null;
  }
}

// send reset password link
export async function sendResetPasswordLink(email) {
  try {
    const response = await fetch("/api/forgotPassword", {
      method: "POST",
      body: JSON.stringify({ email }),
      headers: {
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data;
  } catch (error) {
    console.log("Send reset password link API error", error);
    return null;
  }
}

// get  recommended songs
export async function getRecommendedSongs(artistId, songId) {
  return [];
}
