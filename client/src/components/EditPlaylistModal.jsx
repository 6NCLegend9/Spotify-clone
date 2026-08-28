import { useEffect, useState } from "react";
import { Icon } from "./Icon";

export function EditPlaylistModal({ playlist, onClose, onSave }) {
  const [name, setName] = useState(playlist.name || "");
  const [description, setDescription] = useState(playlist.description || "");
  const [coverUrl, setCoverUrl] = useState(playlist.coverUrl || "");
  const [isPublic, setIsPublic] = useState(Boolean(playlist.isPublic));
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
      await onSave({ name, description, coverUrl, isPublic });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <form className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="edit-playlist-title" onMouseDown={(event) => event.stopPropagation()} onSubmit={submit}>
      <div className="modal-heading"><div><span className="kicker">PLAYLIST</span><h2 id="edit-playlist-title">Edit details</h2></div><button className="icon-button" aria-label="Close" title="Close" type="button" onClick={onClose}><Icon name="close" /></button></div>
      <label className="field-label">Name<input value={name} onChange={(event) => setName(event.target.value)} minLength="2" maxLength="80" pattern=".{2,80}" required /></label>
      <label className="field-label">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength="500" rows="3" /></label>
      <label className="field-label">Cover image URL<input type="url" value={coverUrl} onChange={(event) => setCoverUrl(event.target.value)} placeholder="https://..." /></label>
      <label className="check-row"><input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} /><span>Make playlist public</span></label>
      <div className="modal-footer"><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? "Saving..." : "Save changes"}</button></div>
    </form>
  </div>;
}