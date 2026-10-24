"use client";

import { useState } from "react";
import { X as FiX } from "lucide-react";
import AccessibleDialog from "./AccessibleDialog";
import CoverUploader from "./CoverUploader";
import { updatePlaylist } from "@/services/playlistApi";

export default function EditPlaylistDetails({ playlist, onClose, onSaved }) {
  const [name, setName] = useState(playlist.name || "");
  const [description, setDescription] = useState(playlist.description || "");
  const [coverImage, setCoverImage] = useState(playlist.coverImage || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async (event) => {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true); setError("");
    try {
      const response = await updatePlaylist(playlist._id, "details", { name: name.trim(), description,
        ...(coverImage !== (playlist.coverImage || "") ? { coverImage } : {}),
      });
      if (!response.success || !response.data?.playlist) throw new Error(response.message || "Your changes could not be saved. Try again.");
      window.dispatchEvent(new Event("heykasa:playlists-changed"));
      onSaved?.(response.data.playlist);
      onClose();
    } catch (cause) { setError(cause.message || "Your changes could not be saved. Try again."); }
    finally { setBusy(false); }
  };
  return <AccessibleDialog open onClose={onClose} disableClose={busy} titleId={`edit-playlist-${playlist._id}`} panelClassName="w-full max-w-lg rounded-lg bg-[var(--navy-panel)] p-6 text-white shadow-2xl">
    <form onSubmit={save}>
      <div className="mb-5 flex items-center justify-between"><h2 id={`edit-playlist-${playlist._id}`} className="text-2xl font-bold">Edit details</h2><button type="button" disabled={busy} onClick={onClose} aria-label="Close playlist details" className="icon-btn h-11 w-11"><FiX size="1em" /></button></div>
      <label className="block text-sm font-semibold">Name<input autoFocus required maxLength={80} value={name} disabled={busy} onChange={(event) => setName(event.target.value)} className="field mt-2 w-full" /></label>
      <label className="mt-4 block text-sm font-semibold">Description<textarea maxLength={300} rows={3} value={description} disabled={busy} onChange={(event) => setDescription(event.target.value)} placeholder="Add an optional description" className="field mt-2 w-full resize-y" /></label>
      <div className="mt-4"><CoverUploader value={coverImage} onChange={setCoverImage} disabled={busy} /></div>
      {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
      <div className="mt-5 flex justify-end"><button type="submit" disabled={busy || !name.trim()} className="min-h-12 rounded-full bg-white px-8 font-bold text-black disabled:opacity-40">{busy ? "Saving…" : "Save"}</button></div>
    </form>
  </AccessibleDialog>;
}
