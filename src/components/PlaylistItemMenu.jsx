"use client";
import { createPortal } from "react-dom";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import ItemMenu from "./ItemMenu";
import EditPlaylistDetails from "./EditPlaylistDetails";
import { deletePlaylist, updatePlaylist } from "@/services/playlistApi";

export default function PlaylistItemMenu({ playlist, className = "", onChanged, onDeleted }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const owned = Boolean(session?.user?.id) && String(playlist?.user?._id || playlist?.user || "") === session.user.id;
  if (!playlist?._id) return null;
  const changed = (updated) => { window.dispatchEvent(new Event("heykasa:playlists-changed")); onChanged?.(updated); };
  const save = async (action, value) => {
    const result = await updatePlaylist(playlist._id, action, value);
    if (!result?.success) throw new Error(result?.message || "Playlist could not be updated.");
    changed();
  };
  return <>
    <ItemMenu label={`Playlist options for ${playlist.name}`} className={className} actions={[
      { label: "Open playlist", onSelect: () => router.push(`/library/playlist/${playlist._id}`) },
      owned && { label: "Edit details", onSelect: () => setEditing(true) },
      owned && { label: playlist.pinned ? "Unpin from Library" : "Pin to Library", onSelect: () => save("pinned", !playlist.pinned) },
      owned && { label: "Delete playlist", destructive: true, onSelect: async () => {
        if (!window.confirm(`Delete “${playlist.name}”? This cannot be undone.`)) return;
        const result = await deletePlaylist(playlist._id);
        if (!result?.success) throw new Error(result?.message || "Playlist could not be deleted.");
        changed(); onDeleted?.();
      } },
    ]} />
    {editing && createPortal(<EditPlaylistDetails playlist={playlist} onClose={() => setEditing(false)} onSaved={onChanged} />, document.body)}
  </>;
}
