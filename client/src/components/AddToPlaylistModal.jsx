import { useEffect, useState } from "react";
import { useLibrary } from "../context/LibraryContext";
import { Icon } from "./Icon";

export function AddToPlaylistModal({ track, onClose, onCreatePlaylist }) {
  const { playlists, addTracks } = useLibrary();
  const [savingId, setSavingId] = useState("");

  useEffect(() => {
    const closeOnEscape = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const addTrack = async (playlistId) => {
    setSavingId(playlistId);
    try {
      await addTracks(playlistId, [track.id]);
      onClose();
    } finally {
      setSavingId("");
    }
  };

  const editablePlaylists = playlists.filter((playlist) => playlist.isOwner && playlist.type !== "system");
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="add-to-playlist-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="modal-heading"><div><span className="kicker">YOUR LIBRARY</span><h2 id="add-to-playlist-title">Add to playlist</h2><p>{track.title} - {track.artistName}</p></div><button className="icon-button" aria-label="Close" title="Close" onClick={onClose}><Icon name="close" /></button></div>
      <div className="modal-list">
        {editablePlaylists.map((playlist) => <button className="modal-list-item" key={playlist.id} disabled={savingId === playlist.id} onClick={() => addTrack(playlist.id)}><span><strong>{playlist.name}</strong><small>{playlist.itemCount} songs</small></span><Icon name={savingId === playlist.id ? "loading" : "plus"} /></button>)}
        {!editablePlaylists.length && <p className="empty-copy">Make a playlist first, then build it without a song limit.</p>}
      </div>
      <button className="secondary-button" onClick={onCreatePlaylist}>Create a playlist</button>
    </section>
  </div>;
}