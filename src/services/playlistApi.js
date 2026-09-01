// create playlist
export async function createPlaylist(name, extra = {}) {
  try {
    const response = await fetch(`/api/userPlaylists`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, ...extra }),
    });

    const data = await response.json();
    return data;
  } catch (error) {
    return { success: false, message: "We couldn't create that playlist. Please try again." };
  }
}

// get user playlists
export async function getUserPlaylists() {
  try {
    const response = await fetch(`/api/userPlaylists`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    return data;
  } catch (error) {
    return { success: false, message: "Playlists could not be loaded. Please try again." };
  }
}

// delete playlist
export async function deletePlaylist(id) {
  try {
    const response = await fetch(`/api/userPlaylists`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        playlistId: id,
      }),
    });
    const data = await response.json();
    return data;
  } catch (error) {
    return { success: false, message: "We couldn't delete that playlist. Please try again." };
  }
}

// update playlist settings or collaborators
export async function updatePlaylist(playlistId, action, value) {
  try {
    const payload = action === "addCollaborator"
      ? { playlistId, action, email: value }
      : { playlistId, action, value };
    const response = await fetch(`/api/userPlaylists`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return await response.json();
  } catch (error) {
    return { success: false, message: "The playlist could not be updated. Please try again." };
  }
}

export async function togglePlaylistLike(playlistId) {
  try {
    const response = await fetch(`/api/userPlaylists/like`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playlistId }),
    });
    return await response.json();
  } catch (error) {
    return { success: false, message: "We couldn't update that like. Please try again." };
  }
}

// add song to playlist
export async function addSongToPlaylist(playlistID, song) {
  try {
    const response = await fetch(`/api/userPlaylists/songs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        playlistID,
        song,
      }),
    });
    const data = await response.json();
    return data;
  } catch (error) {
    return { success: false, message: "We couldn't add that song. Please try again." };
  }
}

// delete song from playlist
export async function deleteSongFromPlaylist(playlistID, song) {
  try {
    const response = await fetch(`/api/userPlaylists/songs`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        playlistID,
        song,
      }),
    });
    const data = await response.json();
    return data;
  } catch (error) {
    return { success: false, message: "We couldn't remove that song. Please try again." };
  }
}

// get single playlist by id
export async function getSinglePlaylist(id) {
  try {
    const response = await fetch(`/api/userPlaylists/songs?playlist=${id}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });
    const data = await response.json();
    return data;
  } catch (error) {
    return { success: false, message: "This playlist could not be loaded. Please try again." };
  }
}
