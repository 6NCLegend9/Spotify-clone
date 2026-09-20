"use client";

import ContextMenuTarget from "@/components/ContextMenuTarget";
import PlaylistItemMenu from "@/components/PlaylistItemMenu";
import Link from "next/link";
import { useDispatch, useSelector } from "react-redux";
import { BsPlayFill } from "react-icons/bs";
import { FiHeart } from "react-icons/fi";
import MediaImage from "@/components/MediaImage";
import PlaylistCover from "@/components/PlaylistCover";
import FxEq from "@/components/FxEq";
import AddToQueueButton from "@/components/AddToQueueButton";
import { playHomeTracks } from "@/utils/playHome";
import { cleanTitle } from "@/utils/text";

function QuickCard({ children, className = "", playing, ...props }) {
  const Tag = props.href ? Link : "button";
  return (
    <Tag
      type={props.href ? undefined : "button"}
      className={`home-quick-card group ${playing ? "is-playing" : ""} ${className}`}
      {...props}
    >
      {children}
      {playing ? <span className="home-quick-indicator"><FxEq /></span> : (
        <span className="home-quick-play">
          <BsPlayFill aria-hidden="true" className="text-lg" />
        </span>
      )}
    </Tag>
  );
}

export default function QuickAccessGrid({ items }) {
  const dispatch = useDispatch();
  const { youtubeVideo, activeSong } = useSelector((state) => state.player);

  if (!items?.length) return null;

  return (
    <div className="home-quick">
      {items.slice(0, 6).map((item) => {
        if (item.type === "liked") {
          return (
            <QuickCard key="liked" href="/library/liked" aria-label="Open Liked Songs">
              <span className="grid h-16 w-16 shrink-0 place-items-center bg-gradient-to-br from-[#00e6e6] via-[#128a9a] to-[#3b1d8f]">
                <FiHeart aria-hidden="true" className="text-xl text-white" />
              </span>
              <span className="home-quick-title line-clamp-2">Liked Songs</span>
            </QuickCard>
          );
        }

        if (item.type === "playlist") {
          return (
            <ContextMenuTarget key={`playlist-${item.playlist._id}`} className="home-quick-item">
            <QuickCard href={`/library/playlist/${item.playlist._id}`} aria-label={`Open playlist ${item.playlist.name}`}>
              <span className="h-16 w-16 shrink-0 overflow-hidden">
                <PlaylistCover playlist={item.playlist} className="h-full w-full" />
              </span>
              <span className="home-quick-title line-clamp-2" title={item.playlist.name}>{item.playlist.name}</span>
            </QuickCard>
            <PlaylistItemMenu playlist={item.playlist} className="home-quick-menu" />
            </ContextMenuTarget>
          );
        }

        const title = cleanTitle(item.title || item.name, "Track");
        const playing = youtubeVideo?.id === item.id || activeSong?.id === item.id;
        return (
          <ContextMenuTarget key={`${item.source || "track"}-${item.id}`} className="home-quick-item group relative min-w-0">
            <QuickCard
              playing={playing}
              aria-label={`Play ${title}`}
              className="w-full"
              onClick={() => playHomeTracks(dispatch, item.queue || [item], item.queueIndex || 0)}
            >
              {item.thumbnail || item.image ? (
                <MediaImage
                  src={item.thumbnail || item.image?.[2]?.url || item.image?.[1]?.url || item.image?.[0]?.url || ""}
                  size="mq"
                  alt=""
                  className="home-quick-art"
                />
              ) : (
                <span className="grid h-16 w-16 shrink-0 place-items-center bg-[#101c28] text-[#00e6e6]">
                  <BsPlayFill aria-hidden="true" className="text-xl" />
                </span>
              )}
              <span className="home-quick-title min-w-0 line-clamp-2" title={title}>{title}</span>
            </QuickCard>
            <AddToQueueButton track={item} className="home-quick-menu" />
          </ContextMenuTarget>
        );
      })}
    </div>
  );
}

