"use client";

import { formatDuration } from "@/utils/trackDuration.mjs";
import { memo } from "react";
import { FiHeart, FiPlay, FiTrash2 } from "react-icons/fi";
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
  removable,
  liked,
  onPlay,
  onRemove,
}) {
  const unavailable = track.unavailable === true || track.playable === false;
  const title = cleanTitle(track.title);
  return (
    <ContextMenuTarget
      data-unavailable={unavailable}
      title={unavailable ? "This song is unavailable" : undefined}
      className={`playlist-track-row group grid min-h-[66px] items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.075] ${active ? "bg-white/[0.06]" : ""}`}
    >
      <button
        type="button"
        disabled={unavailable}
        aria-label={unavailable ? `${title} unavailable` : `Play ${title}`}
        onClick={() => onPlay(track)}
        className={`grid h-11 w-11 place-items-center rounded-full text-sm ${active ? "text-[#00e6e6]" : "text-gray-400 group-hover:text-white"}`}
      >
        <span className="group-hover:hidden">{index + 1}</span>
        <FiPlay className="hidden fill-current group-hover:block" />
      </button>
      <div className="flex min-w-0 items-center gap-3 text-left">
        <button type="button" disabled={unavailable} aria-label={`Play artwork for ${title}`} onClick={() => onPlay(track)} className="shrink-0">
        <MediaImage
          src={track.thumbnail}
          size="mq"
          alt=""
          onError={(event) => { event.currentTarget.hidden = true; }}
          className="h-11 w-11 shrink-0 rounded object-cover"
        />
        </button>
        <div className="min-w-0 flex-1">
          <button type="button" disabled={unavailable} onClick={() => onPlay(track)} className={`block w-full truncate text-left text-sm font-semibold ${active ? "text-[#00e6e6]" : "text-white"}`}>{title}</button>
          <ArtistNameLink track={track} className="mt-1 text-xs text-gray-400" />
          {unavailable && cleanTitle(track.unavailableReason) && <span className="mt-1 block truncate text-xs text-gray-400">{cleanTitle(track.unavailableReason)}</span>}
        </div>
      </div>
      <span className="hidden truncate text-xs text-gray-400 md:block">-</span>
      <span className="hidden text-xs text-gray-400 lg:block">{formatAddedDate(track.addedAt)}</span>
      <span className="hidden text-right text-xs tabular-nums text-gray-400 md:block">{formatDuration(track.duration)}</span>
      <div className="flex items-center justify-end gap-1">
        {!unavailable && <AddToQueueButton
          track={track}
          onRemove={removable ? () => onRemove(track) : undefined}
          removeLabel={liked ? "Remove from Liked Songs" : "Remove from playlist"}
          className="pointer-hover-action text-gray-500 hover:text-white"
        />}
        {removable ? (
          <button
            type="button"
            aria-label={liked ? `Remove ${title} from Liked Songs` : `Remove ${title} from playlist`}
            title={liked ? "Remove from Liked Songs" : "Remove from playlist"}
            onClick={() => onRemove(track)}
            className="pointer-hover-action grid h-11 w-11 place-items-center rounded-full text-gray-500 hover:bg-white/10 hover:text-white"
          >
            {liked ? <FiHeart className="fill-current text-[#00e6e6]" /> : <FiTrash2 />}
          </button>
        ) : null}
      </div>
    </ContextMenuTarget>
  );
}

export default memo(PlaylistTrackRow);
