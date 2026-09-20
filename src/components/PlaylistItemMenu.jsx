"use client";
import { createPortal } from "react-dom";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import ItemMenu from "./ItemMenu";
import AccessibleDialog from "./AccessibleDialog";
import { deletePlaylist, updatePlaylist } from "@/services/playlistApi";

export default function PlaylistItemMenu({ playlist, className = "", onChanged, onDeleted }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [editing, setEditing] = useState(false), [name, setName] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const owned = Boolean(session?.user?.id) && String(playlist?.user?._id || playlist?.user || "") === session.user.id;
  if (!playlist?._id) return null;
  const changed = () => { window.dispatchEvent(new Event("heykasa:playlists-changed")); onChanged?.(); };
  const save = async (action, value) => {
    const result = await updatePlaylist(playlist._id, action, value);
    if (!result?.success) throw new Error(result?.message || "Playlist could not be updated.");
    changed();
  };
  return <>
    <ItemMenu label={`Playlist options for ${playlist.name}`} className={className} actions={[
      { label: "Open playlist", onSelect: () => router.push(`/library/playlist/${playlist._id}`) },
      owned && { label: "Rename playlist", onSelect: () => { setName(playlist.name || ""); setError(""); setEditing(true); } },
      owned && { label: playlist.pinned ? "Unpin from Library" : "Pin to Library", onSelect: () => save("pinned", !playlist.pinned) },
      owned && { label: "Delete playlist", destructive: true, onSelect: async () => {
        if (!window.confirm(`Delete “${playlist.name}”? This cannot be undone.`)) return;
        const result = await deletePlaylist(playlist._id);
        if (!result?.success) throw new Error(result?.message || "Playlist could not be deleted.");
        changed(); onDeleted?.();
      } },
    ]} />
    {editing && createPortal(<AccessibleDialog open={editing} onClose={() => { if (!busy) setEditing(false); }} titleId={`rename-${playlist._id}`} closeLabel="Close rename playlist" panelClassName="w-full max-w-md rounded-xl bg-[#111d28] p-6 text-white shadow-2xl">
      <form onSubmit={async (event) => { event.preventDefault(); if (!name.trim() || busy) return; setBusy(true); try { await save("name", name.trim()); setEditing(false); } catch (cause) { setError(cause.message); } finally { setBusy(false); } }}>
        <h2 id={`rename-${playlist._id}`} className="text-xl font-bold">Rename playlist</h2>
        <label className="mt-4 block text-sm">Playlist name<input autoFocus required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} className="mt-2 block w-full rounded-lg border border-white/20 bg-black/30 p-3" /></label>
        {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
        <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setEditing(false)} className="min-h-11 px-4">Cancel</button><button disabled={busy || !name.trim()} className="btn-primary min-h-11 px-5">{busy ? "Saving…" : "Save"}</button></div>
      </form>
    </AccessibleDialog>, document.body)}
  </>;
}
