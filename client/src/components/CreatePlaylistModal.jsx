import { useEffect, useState } from "react";
import { useLibrary } from "../context/LibraryContext";
import { useToast } from "../context/ToastContext";
import { Icon } from "./Icon";

export function CreatePlaylistModal({ onClose, onCreated }) {
  const { createPlaylist } = useLibrary();
  const { notify } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isFavorite, setIsFavorite] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const playlist = await createPlaylist({ name, description, isPublic, type: isFavorite ? "favorites" : "user" });
      notify("Playlist created", "success");
      onCreated?.(playlist);
      onClose();
    } catch (error) {
      notify(error.message || "Unable to create playlist", "error");
    } finally {
      setSaving(false);
    }
  };

  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <form className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="create-playlist-title" onMouseDown={(event) => event.stopPropagation()} onSubmit={submit}>
      <div className="modal-heading"><div><span className="kicker">YOUR LIBRARY</span><h2 id="create-playlist-title">New playlist</h2></div><button className="icon-button" aria-label="Close" title="Close" type="button" onClick={onClose}><Icon name="close" /></button></div>
      <label className="field-label">Name<input value={name} onChange={(event) => setName(event.target.value)} minLength="2" maxLength="80" pattern=".{2,80}" required /></label>
      <label className="field-label">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength="500" rows="3" /></label>
      <label className="check-row"><input type="checkbox" checked={isFavorite} onChange={(event) => setIsFavorite(event.target.checked)} /> <span>Make this an unlimited favorites playlist</span></label>
      <label className="check-row"><input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} /> <span>Make playlist public</span></label>
      <div className="modal-footer"><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? "Creating..." : "Create playlist"}</button></div>
    </form>
  </div>;
}