const configuredSaavnApi = process.env.NEXT_PUBLIC_SAAVN_API?.replace(/\/$/, "");
const SAAVN_API_BASE_URL =
  configuredSaavnApi && !configuredSaavnApi.includes("saavn.dev")
    ? configuredSaavnApi
    : "https://jiosaavn-api.vercel.app";
const USE_MODERN_SAAVN_API = SAAVN_API_BASE_URL.includes("jiosaavn-api.vercel.app");

function normalizeSong(song) {
  if (!song) return null;
  const images = song.images || {};
  const imageUrls = [images["50x50"], images["150x150"], images["500x500"]].filter(Boolean);
  const primaryArtists = song.primary_artists || song.more_info?.singers;
  const artists = typeof primaryArtists === "string"
    ? primaryArtists.split(",").map((name, index) => ({ id: `${song.id}-${index}`, name: name.trim() }))
    : song.artists;
  const mediaUrls = song.media_urls || {};
  const fallbackAudio = song.media_url || mediaUrls["160_KBPS"] || mediaUrls["320_KBPS"];
  const downloadUrl = [
    mediaUrls["96_KBPS"] || fallbackAudio,
    mediaUrls["160_KBPS"] || fallbackAudio,
    mediaUrls["320_KBPS"] || fallbackAudio,
    mediaUrls["320_KBPS"] || fallbackAudio,
    mediaUrls["320_KBPS"] || fallbackAudio,
  ].map((url) => ({ url }));

  return {
    ...song,
    type: song.type || "song",
    name: song.name || song.song || song.title,
    title: song.title || song.song,
    image: Array.isArray(song.image)
      ? song.image
      : imageUrls.map((url) => ({ url })),
    artists: artists ? { primary: artists } : song.artists,
    primaryArtists: song.primaryArtists || primaryArtists,
    downloadUrl: song.downloadUrl || downloadUrl,
  };
}

async function searchSongs(query) {
  const response = await fetch(
    `${SAAVN_API_BASE_URL}/api/search?query=${encodeURIComponent(query)}`,
    { next: { revalidate: 3600 } },
  );
  if (!response.ok) return [];
  const data = await response.json();
  return (data?.results || []).map(normalizeSong).filter(Boolean);
}

// home page data
export async function homePageData(language) {
  try {
    const lang = Array.isArray(language) ? language.join(",") : language?.toString() || "";
    if (USE_MODERN_SAAVN_API) {
      const songs = await searchSongs(lang || "trending");
      return {
        trending: { songs },
        charts: songs,
        albums: songs,
        playlists: [],
      };
    }
    const response = await fetch(
      `${SAAVN_API_BASE_URL}/api/modules?language=${encodeURIComponent(lang)}`,
      { next: { revalidate: 86400 } },
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data?.data;
  } catch (error) {
    console.log("homePageData error:", error);
    return null;
  }
}

// get song data
export async function getSongData(id) {
  try {
    const response = await fetch(
      USE_MODERN_SAAVN_API
        ? `${SAAVN_API_BASE_URL}/song?id=${encodeURIComponent(id)}`
        : `${SAAVN_API_BASE_URL}/api/songs/${id}`,
    );
    if (!response.ok) return null;
    const data = await response.json();
    return USE_MODERN_SAAVN_API ? normalizeSong(data) : data?.data;
  } catch (error) {
    console.log("getSongData error:", error);
    return null;
  }
}

// get album data
export async function getAlbumData(id) {
  try {
    const response = await fetch(
      USE_MODERN_SAAVN_API
        ? `${SAAVN_API_BASE_URL}/album?id=${encodeURIComponent(id)}`
        : `${SAAVN_API_BASE_URL}/api/albums?id=${id}`,
    );
    if (!response.ok) return null;
    const data = await response.json();
    if (!USE_MODERN_SAAVN_API) return data?.data;
    return {
      ...data,
      id: data.albumid,
      name: data.name || data.title,
      image: [{ url: data.image }, { url: data.image }, { url: data.image }],
      songs: (data.songs || []).map(normalizeSong),
    };
  } catch (error) {
    console.log("getAlbumData error:", error);
    return null;
  }
}

// get playlist data
export async function getplaylistData(id) {
  try {
    if (USE_MODERN_SAAVN_API) return null;
    const response = await fetch(
      `${SAAVN_API_BASE_URL}/api/playlists?id=${id}&limit=50`,
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data?.data;
  } catch (error) {
    console.log("getplaylistData error:", error);
    return null;
  }
}

// get Lyrics data
export async function getlyricsData(lyricsId) {
  try {
    if (USE_MODERN_SAAVN_API) return null;
    const response = await fetch(
      `${SAAVN_API_BASE_URL}/api/songs/${encodeURIComponent(lyricsId)}/lyrics`,
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data?.data;
  } catch (error) {
    console.log("getlyricsData error:", error);
    return null;
  }
}

// get artist data
export async function getArtistData(id) {
  try {
    if (USE_MODERN_SAAVN_API) return null;
    const response = await fetch(
      `${SAAVN_API_BASE_URL}/api/artists?id=${id}`,
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data?.data;
  } catch (error) {
    console.log("getArtistData error:", error);
    return null;
  }
}

// get artist songs
export async function getArtistSongs(id, page) {
  try {
    if (USE_MODERN_SAAVN_API) return [];
    const response = await fetch(
      `${SAAVN_API_BASE_URL}/api/artists/${id}/songs?page=${page}&`,
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data?.data;
  } catch (error) {
    console.log("getArtistSongs error:", error);
    return null;
  }
}

// get artist albums
export async function getArtistAlbums(id, page) {
  try {
    if (USE_MODERN_SAAVN_API) return [];
    const response = await fetch(
      `${SAAVN_API_BASE_URL}/api/artists/${id}/albums?page=${page}`,
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data?.data;
  } catch (error) {
    console.log("getArtistAlbums error:", error);
    return null;
  }
}

// get search data
export async function getSearchedData(query) {
  try {
    if (USE_MODERN_SAAVN_API) {
      return { songs: { results: await searchSongs(query) }, albums: [], artists: [], playlists: [] };
    }
    const response = await fetch(
      `${SAAVN_API_BASE_URL}/api/search?query=${encodeURIComponent(query)}`,
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data?.data;
  } catch (error) {
    console.log("getSearchedData error:", error);
    return null;
  }
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
  try {
    if (USE_MODERN_SAAVN_API) return [];
    const response = await fetch(
      `${SAAVN_API_BASE_URL}/api/songs/${songId}/suggestions`,
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data?.data;
  } catch (error) {
    console.log("getRecommendedSongs error:", error);
    return null;
  }
}
