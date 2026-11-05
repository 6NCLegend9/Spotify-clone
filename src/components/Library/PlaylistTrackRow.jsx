"use client";

import { formatDuration } from "@/utils/trackDuration.mjs";
import { memo } from "react";
import { Heart as FiHeart, Play as FiPlay, Pause as FiPause, Trash2 as FiTrash2 } from "lucide-react";
import AddToQueueButton from "@/components/AddToQueueButton";
import ContextMenuTarget from "@/components/ContextMenuTarget";
import MediaImage from "@/components/MediaImage";
import ArtistNameLink from "@/components/ArtistNameLink";
import { cleanTitle } from "@/utils/text";

function formatAddedDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

function PlaylistTrackRow({
  track,
  index,
  active,
  isPlaying,
  removable,
  liked,
  onPlay,
  onRemove,
  reorderable,
  nextEntryId,
  onMove,
  onMoveUp,
  onMoveDown,
}) {
  const unavailable = track.unavailable === true || track.playable === false;
  const title = cleanTitle(track.title);
  return (
    <ContextMenuTarget
      data-unavailable={unavailable}
      data-playlist-entry={track.playlistEntryId || track.id}
      data-active={Boolean(active)}
      draggable={Boolean(reorderable)}
      onDragStart={event => {
        if (!reorderable || !track.playlistEntryId) { event.preventDefault(); return; }
        event.dataTransfer.setData("application/x-haykasa-playlist-item", track.playlistEntryId);
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={event => {
        if (reorderable && event.dataTransfer.types.includes("application/x-haykasa-playlist-item")) {
          event.preventDefault(); event.dataTransfer.dropEffect = "move";
        }
      }}
      onDrop={event => {
        if (!reorderable) return;
        const entryId = event.dataTransfer.getData("application/x-haykasa-playlist-item");
        if (!entryId || entryId === track.playlistEntryId) return;
        event.preventDefault();
        const bounds = event.currentTarget.getBoundingClientRect();
        onMove?.(entryId, event.clientY > bounds.top + bounds.height / 2 ? nextEntryId : track.playlistEntryId);
      }}
      title={unavailable ? "This song is unavailable" : undefined}
      className={`playlist-track-row group grid min-h-[66px] items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.075] ${active ? "bg-white/[0.06]" : ""}`}
    >
      <button
        type="button"
        disabled={unavailable}
        aria-label={unavailable ? `${title} unavailable` : `${active && isPlaying ? "Pause" : "Play"} ${title}`}
        onClick={() => onPlay(track)}
        className={`grid h-11 w-11 place-items-center rounded-full text-sm ${active ? "text-[var(--accent)]" : "text-gray-400 group-hover:text-white"}`}
      >
        <span className="group-hover:hidden">{index + 1}</span>
        {active && isPlaying ? <FiPause size="1em" fill="currentColor" className="hidden fill-current group-hover:block" /> : <FiPlay size="1em" fill="currentColor" className="hidden fill-current group-hover:block" />}
      </button>
      <div className="flex min-w-0 items-center gap-3 text-left">
        <button type="button" disabled={unavailable} aria-label={`${active && isPlaying ? "Pause" : "Play"} artwork for ${title}`} onClick={() => onPlay(track)} className="shrink-0">
        <MediaImage
          src={track.thumbnail}
          size="mq"
          alt=""
          onError={(event) => { event.currentTarget.hidden = true; }}
          className="h-11 w-11 shrink-0 rounded object-cover"
        />
        </button>
        <div className="min-w-0 flex-1">
          <button type="button" disabled={unavailable} onClick={() => onPlay(track)} className={`block w-full truncate text-left text-sm font-semibold ${active ? "text-[var(--accent)]" : "text-white"}`}>{title}</button>
          <ArtistNameLink track={track} className="mt-1 text-xs text-gray-400" />
          {unavailable && cleanTitle(track.unavailableReason) && <span className="mt-1 block truncate text-xs text-gray-400">{cleanTitle(track.unavailableReason)}</span>}
        </div>
      </div>
      <span className="hidden truncate text-xs text-gray-400 md:block">-</span>
      <span className="hidden text-xs text-gray-400 lg:block">{formatAddedDate(track.addedAt)}</span>
      <span data-track-duration title={Number(track.duration) > 0 ? "Song duration" : "Duration unavailable"} className="text-right text-xs tabular-nums text-gray-400">{formatDuration(track.duration)}</span>
      <div className="flex items-center justify-end gap-1">
        <AddToQueueButton
          track={track}
          onRemove={removable ? () => onRemove(track) : undefined}
          removeLabel={liked ? "Remove from Liked Songs" : "Remove from playlist"}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          className="pointer-hover-action text-gray-500 hover:text-white"
        />
        {removable ? (
          <button
            type="button"
            aria-label={liked ? `Remove ${title} from Liked Songs` : `Remove ${title} from playlist`}
            title={liked ? "Remove from Liked Songs" : "Remove from playlist"}
            onClick={() => onRemove(track)}
            className="pointer-hover-action grid h-11 w-11 place-items-center rounded-full text-gray-500 hover:bg-white/10 hover:text-white"
          >
            {liked ? <FiHeart size="1em" className="fill-current text-[#096192]" /> : <FiTrash2 size="1em" />}
          </button>
        ) : null}
      </div>
    </ContextMenuTarget>
  );
}

export default memo(PlaylistTrackRow);
