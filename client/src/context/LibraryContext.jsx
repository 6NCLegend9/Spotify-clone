import { createContext, useContext } from "react";
import { useState } from "react";
import { useLikedTracks } from "../hooks/useLikedTracks";
import { usePlaylists } from "../hooks/usePlaylists";
import { useToast } from "./ToastContext";

const LibraryContext = createContext(null);

export function LibraryProvider({ children }) {
  const likes = useLikedTracks();
  const playlists = usePlaylists();
  const { notify } = useToast();
  const [recommendationRevision, setRecommendationRevision] = useState(0);
  const invalidateRecommendations = () => setRecommendationRevision((value) => value + 1);

  const toggleLike = async (track) => {
    try {
      const isNowLiked = await likes.toggleLike(track);
      invalidateRecommendations();
      notify(isNowLiked ? "Added to liked songs" : "Removed from liked songs", "success");
      return isNowLiked;
    } catch (error) {
      notify(error.message || "Unable to update liked songs", "error");
      throw error;
    }
  };

  const addTracks = async (playlistId, trackIds) => {
    try {
      const result = await playlists.addTracks(playlistId, trackIds);
      notify(result.addedTrackIds.length ? "Added to playlist" : "Those songs are already in the playlist", "success");
      return result;
    } catch (error) {
      notify(error.message || "Unable to add songs to playlist", "error");
      throw error;
    }
  };

  return <LibraryContext.Provider value={{
    likedTracks: likes.likedTracks,
    likedIds: likes.likedIds,
    likesLoading: likes.loading,
    likesLoadingMore: likes.loadingMore,
    likesError: likes.error,
    likesNextCursor: likes.nextCursor,
    refreshLikes: likes.refresh,
    loadMoreLikes: likes.loadMore,
    playlists: playlists.playlists,
    playlistsLoading: playlists.loading,
    playlistsLoadingMore: playlists.loadingMore,
    playlistsError: playlists.error,
    playlistsNextCursor: playlists.nextCursor,
    refreshPlaylists: playlists.refresh,
    loadMorePlaylists: playlists.loadMore,
    createPlaylist: playlists.createPlaylist,
    updatePlaylist: playlists.updatePlaylist,
    deletePlaylist: playlists.deletePlaylist,
    toggleLike,
    addTracks,
    recommendationRevision,
    invalidateRecommendations,
  }}>
    {children}
  </LibraryContext.Provider>;
}

export function useLibrary() {
  const context = useContext(LibraryContext);
  if (!context) throw new Error("useLibrary must be used inside LibraryProvider");
  return context;
}