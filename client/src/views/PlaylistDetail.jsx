import { useEffect, useState } from "react";
import { useHashRoute, navigate } from "../hooks/useHashRoute";
import { usePlayer } from "../context/PlayerContext";
import { useLibrary } from "../context/LibraryContext";
import { useToast } from "../context/ToastContext";
import { api, withQuery } from "../lib/api";
import { AddToPlaylistModal } from "../components/AddToPlaylistModal";
import { CreatePlaylistModal } from "../components/CreatePlaylistModal";
import { EditPlaylistModal } from "../components/EditPlaylistModal";
import { SkeletonTrackRow } from "../components/Skeletons";
import { TrackRow } from "../components/TrackRow";
import { Icon } from "../components/Icon";
import { StartRadioButton } from "../components/StartRadioButton";

function formatFollowerCount(count) {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(Number(count) || 0);
}

export function PlaylistDetail() {
  const { params } = useHashRoute();
  const playlistId = params.id;
  const { play, addToQueue } = usePlayer();
  const { deletePlaylist, refreshPlaylists, updatePlaylist } = useLibrary();
  const { notify } = useToast();
  const [playlist, setPlaylist] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [followPending, setFollowPending] = useState(false);
  const [removingTrackId, setRemovingTrackId] = useState("");
  const [deletingPlaylist, setDeletingPlaylist] = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState(false);
  const [playlistTrack, setPlaylistTrack] = useState(null);
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const [playlistResponse, itemsResponse] = await Promise.all([api.get(`/api/playlists/${playlistId}`), api.get(withQuery(`/api/playlists/${playlistId}/items`, { limit: 50 }))]);
        if (active) {
          setPlaylist(playlistResponse.data);
          setTracks(itemsResponse.data || []);
          setNextCursor(itemsResponse.nextCursor || null);
          setError("");
        }
      } catch (requestError) {
        if (active) setError(requestError.message);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [playlistId]);

  const loadMoreTracks = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await api.get(withQuery(`/api/playlists/${playlistId}/items`, { limit: 50, cursor: nextCursor }));
      setTracks((current) => [...current, ...(response.data || []).filter((track) => !current.some((existing) => existing.id === track.id))]);
      setNextCursor(response.nextCursor || null);
    } catch (requestError) {
      notify(requestError.message || "Unable to load more playlist tracks", "error");
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleFollow = async () => {
    if (!playlist || playlist.isOwner || followPending) return;
    const wasFollowed = playlist.isFollowed;
    setFollowPending(true);
    setPlaylist((current) => current ? { ...current, isFollowed: !wasFollowed, followerCount: Math.max(0, current.followerCount + (wasFollowed ? -1 : 1)) } : current);
    try {
      if (wasFollowed) await api.delete(`/api/playlists/${playlist.id}/follow`);
      else await api.post(`/api/playlists/${playlist.id}/follow`);
      refreshPlaylists();
      notify(wasFollowed ? "Removed from followed playlists" : "Added to followed playlists", "success");
    } catch (requestError) {
      setPlaylist((current) => current ? { ...current, isFollowed: wasFollowed, followerCount: Math.max(0, current.followerCount + (wasFollowed ? 1 : -1)) } : current);
      notify(requestError.message || "Unable to update followed playlists", "error");
    } finally {
      setFollowPending(false);
    }
  };

  const removeTrack = async (track) => {
    if (!playlist?.isOwner || playlist.type === "system" || !track?.id || removingTrackId) return;
    const previousTracks = tracks;
    const previousPlaylist = playlist;
    setRemovingTrackId(track.id);
    setTracks((current) => current.filter((item) => item.id !== track.id));
    setPlaylist((current) => current ? { ...current, itemCount: Math.max(0, current.itemCount - 1) } : current);
    try {
      await api.delete(`/api/playlists/${playlist.id}/items/${track.id}`);
      refreshPlaylists();
      notify("Removed from playlist", "success");
    } catch (requestError) {
      setTracks(previousTracks);
      setPlaylist(previousPlaylist);
      notify(requestError.message || "Unable to remove this playlist track", "error");
    } finally {
      setRemovingTrackId("");
    }
  };

  const removePlaylist = async () => {
    if (!playlist?.isOwner || playlist.type === "system" || deletingPlaylist) return;
    if (!window.confirm(`Delete "${playlist.name}"? This cannot be undone.`)) return;
    setDeletingPlaylist(true);
    try {
      await deletePlaylist(playlist.id);
      notify("Playlist deleted", "success");
      navigate("/library?tab=playlists");
    } catch (requestError) {
      notify(requestError.message || "Unable to delete this playlist", "error");
    } finally {
      setDeletingPlaylist(false);
    }
  };

  const savePlaylistDetails = async (values) => {
    try {
      const updated = await updatePlaylist(playlist.id, values);
      setPlaylist(updated);
      notify("Playlist updated", "success");
    } catch (requestError) {
      notify(requestError.message || "Unable to update playlist", "error");
      throw requestError;
    }
  };

  if (loading) return <div className="playlist-detail reveal"><div className="playlist-summary skeleton-summary" /><section className="songs-panel">{Array.from({ length: 8 }, (_, index) => <SkeletonTrackRow key={index} />)}</section></div>;
  if (error || !playlist) return <div className="empty-state reveal"><h1>Playlist unavailable</h1><p>{error || "This playlist could not be found."}</p><button className="secondary-button" onClick={() => navigate("/library")}>Back to library</button></div>;

  return <div className="playlist-detail reveal">
    <aside className="playlist-summary"><img src={playlist.coverUrl || "https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?w=800&q=80"} alt="" /><span className="kicker">{playlist.type === "favorites" ? "UNLIMITED FAVORITES" : playlist.type === "system" ? "FOR YOU" : "PLAYLIST"}</span><h1>{playlist.name}</h1><p>{playlist.description || "A collection from your Musicon library."}</p><small>{playlist.itemCount} songs {Number(playlist.followerCount) > 0 && <><span>•</span>{formatFollowerCount(playlist.followerCount)} followers</>}</small><div className="playlist-summary-actions"><button className="primary-button" disabled={!tracks.length} onClick={() => tracks.length && play(tracks[0], tracks, 0, { type: "playlist", refId: playlist.id })}><Icon name="play" />Play</button>{!playlist.isOwner && <button className="secondary-button" onClick={toggleFollow} disabled={followPending}>{playlist.isFollowed ? "Following" : "Follow"}</button>}<button className="icon-button" aria-label="Add loaded songs to queue" title="Add loaded songs to queue" onClick={() => tracks.forEach(addToQueue)}><Icon name="queue" /></button><StartRadioButton seedType="playlist" seedId={playlist.id} className="icon-button" iconOnly ariaLabel="Start playlist radio" title="Start playlist radio" />{playlist.isOwner && playlist.type !== "system" && <><button className="icon-button" aria-label={`Edit ${playlist.name}`} title="Edit playlist details" onClick={() => setEditingPlaylist(true)}><Icon name="edit" /></button><button className="icon-button playlist-delete-button" aria-label={`Delete ${playlist.name}`} title="Delete playlist" disabled={deletingPlaylist} onClick={removePlaylist}><Icon name={deletingPlaylist ? "loading" : "trash"} /></button></>}</div></aside>
    <section className="songs-panel"><div className="songs-panel-heading"><div><span className="kicker">SONGS</span><h2>In this playlist</h2></div><span>{playlist.itemCount} total</span></div><div className="track-list"><div className="track-list-header"><span>#</span><span>Title</span><span>Album</span><span>Duration</span></div>{tracks.map((track, index) => <TrackRow track={track} key={track.id} index={index} contextQueue={tracks} context={{ type: "playlist", refId: playlist.id }} onAddToPlaylist={setPlaylistTrack} onRemoveFromPlaylist={playlist.isOwner && playlist.type !== "system" ? removeTrack : undefined} removingFromPlaylist={removingTrackId === track.id} />)}{!tracks.length && <div className="empty-state"><h2>This playlist is ready for songs</h2><p>Add a track from Home or Search. There is no song limit.</p></div>}</div>{nextCursor && <button className="secondary-button load-more-button" onClick={loadMoreTracks} disabled={loadingMore}>{loadingMore ? "Loading songs..." : "Load more songs"}</button>}</section>
    {playlistTrack && <AddToPlaylistModal track={playlistTrack} onClose={() => setPlaylistTrack(null)} onCreatePlaylist={() => { setPlaylistTrack(null); setCreatingPlaylist(true); }} />}
    {creatingPlaylist && <CreatePlaylistModal onClose={() => setCreatingPlaylist(false)} />}
    {editingPlaylist && <EditPlaylistModal playlist={playlist} onClose={() => setEditingPlaylist(false)} onSave={savePlaylistDetails} />}
  </div>;
}