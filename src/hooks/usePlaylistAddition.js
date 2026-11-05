"use client";

import { useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { addSongToPlaylist } from "@/services/playlistApi";
import { notifyPlaylistChanged } from "@/utils/playlistEvents.mjs";
import { toUserError } from "@/utils/userError";

// Both entry points share the same mutation semantics. Keep an uncertain
// request's id for retry so a lost response cannot add a second occurrence.
export default function usePlaylistAddition(scope, onCloseMenu) {
  const busy = useRef(false);
  const intent = useRef(null);
  const [addingId, setAddingId] = useState(null);
  const [duplicate, setDuplicate] = useState(null);

  const perform = async (playlist, track, allowDuplicate = false) => {
    if (busy.current || !playlist?._id || !track?.id || !scope.isCurrent()) return "ignored";
    if (intent.current?.playlistId !== playlist._id || intent.current?.song !== track.id) {
      intent.current = { playlistId: playlist._id, song: track.id, requestId: crypto.randomUUID() };
    }
    const requestId = intent.current.requestId;
    busy.current = true;
    setAddingId(playlist._id);
    let response;
    try {
      response = await addSongToPlaylist(playlist._id, track.id, track.duration, { allowDuplicate, requestId });
    } catch (error) {
      response = error;
    }
    if (!scope.isCurrent()) return "stale";
    busy.current = false;
    setAddingId(null);
    if (response?.success && response.duplicate === true && response.added === false) {
      // Close the portal and restore its stable trigger before the dialog's
      // focus trap records a return target. Menu items disappear on close.
      onCloseMenu?.();
      setDuplicate({ playlist, track });
      return "duplicate";
    }
    if (response?.success) {
      intent.current = null;
      setDuplicate(null);
      if (response.data?.playlist) notifyPlaylistChanged({ owner: scope.owner, playlist: response.data.playlist });
      toast.success(`Added to ${playlist.name || "playlist"}`);
      onCloseMenu?.();
      return "added";
    }
    const error = toUserError(response, {
      title: "Song not added", message: "We couldn’t add that song. Please try again.",
    });
    toast.error(error.message);
    return "error";
  };

  return {
    addingId,
    duplicate,
    add: (playlist, track) => perform(playlist, track),
    confirmDuplicate: () => duplicate ? perform(duplicate.playlist, duplicate.track, true) : Promise.resolve("ignored"),
    cancelDuplicate: () => {
      if (busy.current) return;
      intent.current = null;
      setDuplicate(null);
    },
  };
}
