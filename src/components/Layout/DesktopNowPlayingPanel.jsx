"use client";

import { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { FiChevronLeft, FiChevronRight, FiList, FiPlay } from "react-icons/fi";
import { setYoutubeVideo } from "@/redux/features/playerSlice";
import MediaImage from "@/components/MediaImage";
import { cleanTitle } from "@/utils/text";

export default function DesktopNowPlayingPanel({ collapsed, onToggle }) {
  const dispatch = useDispatch();
  const track = useSelector((state) => state.player.youtubeVideo);
  const queue = useSelector((state) => state.player.youtubeQueue || []);
  const upcoming = useMemo(() => {
    const index = queue.findIndex((item) => item?.id === track?.id);
    return queue.slice(index >= 0 ? index + 1 : 0).filter((item) => item?.id).slice(0, 20);
  }, [queue, track?.id]);

  return (
    <aside className={`now-playing-panel ${collapsed ? "is-collapsed" : ""}`} aria-label="Now playing and queue">
      <header className="now-playing-panel__header">
        <button
          type="button"
          onClick={onToggle}
          className="icon-btn"
          aria-label={collapsed ? "Open now playing panel" : "Close now playing panel"}
          title={collapsed ? "Open now playing panel" : "Close now playing panel"}
        >
          {collapsed ? <FiChevronLeft /> : <FiChevronRight />}
        </button>
        {!collapsed && <h2>Now playing</h2>}
      </header>

      {!collapsed && (
        <div className="now-playing-panel__body">
          {track?.id ? (
            <>
              <MediaImage src={track.thumbnail} size="hq" alt="" className="now-playing-panel__art" />
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-white">{cleanTitle(track.title)}</p>
                <p className="mt-1 truncate text-xs text-[var(--muted)]">{cleanTitle(track.channel)}</p>
              </div>

              <section className="mt-6 min-h-0" aria-labelledby="desktop-queue-title">
                <div className="mb-3 flex items-center gap-2">
                  <FiList className="text-[var(--accent)]" />
                  <h3 id="desktop-queue-title" className="text-xs font-semibold uppercase tracking-widest text-white">Next in queue</h3>
                </div>
                <div className="now-playing-panel__queue">
                  {upcoming.length > 0 ? upcoming.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => dispatch(setYoutubeVideo(item))}
                      className="now-playing-panel__track group"
                      aria-label={`Play ${cleanTitle(item.title)}`}
                    >
                      <MediaImage src={item.thumbnail} size="mq" alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-xs font-semibold text-white">{cleanTitle(item.title)}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-[var(--muted)]">{cleanTitle(item.channel)}</span>
                      </span>
                      <FiPlay className="shrink-0 opacity-0 transition group-hover:opacity-100" />
                    </button>
                  )) : (
                    <p className="py-4 text-xs text-[var(--muted)]">The queue is empty.</p>
                  )}
                </div>
              </section>
            </>
          ) : (
            <p className="px-2 py-6 text-sm text-[var(--muted)]">Play a song to see it here.</p>
          )}
        </div>
      )}
    </aside>
  );
}
