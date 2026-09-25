"use client";

import { memo } from "react";
import { FiHeart, FiPlay, FiTrash2 } from "react-icons/fi";
import AddToQueueButton from "@/components/AddToQueueButton";
import ContextMenuTarget from "@/components/ContextMenuTarget";
import MediaImage from "@/components/MediaImage";
import { cleanTitle } from "@/utils/text";

function formatDuration(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  if (value === 0) return "—";
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
}

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
  removable,
  liked,
  onPlay,
  onRemove,
}) {
  const title = cleanTitle(track.title);
  const artist = cleanTitle(track.channel);
  return (
    <ContextMenuTarget
      className={`playlist-track-row group grid min-h-[66px] grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/[0.075] md:grid-cols-[44px_minmax(160px,2fr)_minmax(100px,1fr)_60px_96px] lg:grid-cols-[44px_minmax(200px,2fr)_minmax(120px,1fr)_120px_70px_96px] ${active ? "bg-white/[0.06]" : ""}`}
    >
      <button
        type="button"
        aria-label={`Play ${title}`}
        onClick={() => onPlay(track)}
        className={`grid h-11 w-11 place-items-center rounded-full text-sm ${active ? "text-[#00e6e6]" : "text-gray-400 group-hover:text-white"}`}
      >
        <span className="group-hover:hidden">{index + 1}</span>
        <FiPlay className="hidden fill-current group-hover:block" />
      </button>
      <button type="button" onClick={() => onPlay(track)} className="flex min-w-0 items-center gap-3 text-left">
        <MediaImage
          src={track.thumbnail}
          size="mq"
          alt=""
          onError={(event) => { event.currentTarget.hidden = true; }}
          className="h-11 w-11 shrink-0 rounded object-cover"
        />
        <span className="min-w-0">
          <span className={`block truncate text-sm font-semibold ${active ? "text-[#00e6e6]" : "text-white"}`}>{title}</span>
          <span className="mt-1 block truncate text-xs text-gray-400">{artist}</span>
        </span>
      </button>
      <span className="hidden truncate text-xs text-gray-400 md:block">-</span>
      <span className="hidden text-xs text-gray-400 lg:block">{formatAddedDate(track.addedAt)}</span>
      <span className="hidden text-right text-xs tabular-nums text-gray-400 md:block">{formatDuration(track.duration)}</span>
      <div className="flex items-center justify-end gap-1">
        <AddToQueueButton
          track={track}
          onRemove={removable ? () => onRemove(track) : undefined}
          removeLabel={liked ? "Remove from Liked Songs" : "Remove from playlist"}
          className="text-gray-500 opacity-100 hover:text-white sm:opacity-0 sm:group-hover:opacity-100"
        />
        {removable ? (
          <button
            type="button"
            aria-label={liked ? `Remove ${title} from Liked Songs` : `Remove ${title} from playlist`}
            title={liked ? "Remove from Liked Songs" : "Remove from playlist"}
            onClick={() => onRemove(track)}
            className="grid h-11 w-11 place-items-center rounded-full text-gray-500 opacity-100 hover:bg-white/10 hover:text-white sm:opacity-0 sm:group-hover:opacity-100"
          >
            {liked ? <FiHeart className="fill-current text-[#00e6e6]" /> : <FiTrash2 />}
          </button>
        ) : null}
      </div>
    </ContextMenuTarget>
  );
}

export default memo(PlaylistTrackRow);
