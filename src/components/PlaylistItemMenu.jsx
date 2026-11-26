"use client";
import { createPortal } from "react-dom";
import { useState } from "react";
import { useRouter } from "next/navigation";
import ItemMenu from "./ItemMenu";
import EditPlaylistDetails from "./EditPlaylistDetails";
import { deletePlaylist, togglePlaylistLike, updatePlaylist } from "@/services/playlistApi";
import useAccountScope from "@/hooks/useAccountScope";
import { notifyPlaylistChanged } from "@/utils/playlistEvents.mjs";

export default function PlaylistItemMenu(props) {
  const scope = useAccountScope();
  return <AccountPlaylistItemMenu key={`${scope.key}:${props.playlist?._id}`} {...props} />;
}

function AccountPlaylistItemMenu({ playlist, className = "", onChanged, onDeleted }) {
  const scope = useAccountScope();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const owned = scope.status === "authenticated"
    && scope.owner === `account:${playlist?.user?._id || playlist?.user || ""}`;
  if (!playlist?._id) return null;
  const changed = (updated) => {
    notifyPlaylistChanged({ owner: scope.owner, playlist: updated });
    onChanged?.(updated);
  };
  const save = async (action, value) => {
    if (!scope.isCurrent()) return;
    const result = await updatePlaylist(playlist._id, action, value);
    if (!scope.isCurrent()) return;
    if (!result?.success) throw new Error(result?.message || "Playlist could not be updated.");
    changed(result.data?.playlist || { ...playlist, [action]: value });
  };
  return <>
    <ItemMenu label={`Playlist options for ${playlist.name}`} className={className} actions={[
      { label: "Open playlist", onSelect: () => {
        if (scope.isCurrentView()) router.push(`/library/playlist/${encodeURIComponent(playlist._id)}`);
      } },
      owned && { label: "Edit details", onSelect: () => { if (scope.isCurrent()) setEditing(true); } },
      owned && { label: playlist.pinned ? "Unpin from Library" : "Pin to Library", onSelect: () => save("pinned", !playlist.pinned) },
      !owned && scope.status === "authenticated" && (playlist.visibility === "public" || playlist.liked) && {
        label: playlist.liked ? "Remove from Your Library" : "Save to Your Library",
        onSelect: async () => {
          if (!scope.isCurrent()) return;
          const result = await togglePlaylistLike(playlist._id, !playlist.liked);
          if (!scope.isCurrent()) return;
          if (!result?.success) throw new Error(result?.message || "Your library could not be updated.");
          changed({ ...playlist, ...result.data, liked: result.data?.liked ?? !playlist.liked });
        },
      },
      owned && { label: "Delete playlist", destructive: true, onSelect: async () => {
        if (!scope.isCurrent()) return;
        if (!window.confirm(`Delete “${playlist.name}”? This cannot be undone.`)) return;
        const result = await deletePlaylist(playlist._id);
        if (!scope.isCurrent()) return;
        if (!result?.success) throw new Error(result?.message || "Playlist could not be deleted.");
        notifyPlaylistChanged({ owner: scope.owner, deletedId: playlist._id });
        onDeleted?.();
      } },
    ]} />
    {editing && createPortal(<EditPlaylistDetails playlist={playlist} onClose={() => setEditing(false)} onSaved={onChanged} />, document.body)}
  </>;
}
