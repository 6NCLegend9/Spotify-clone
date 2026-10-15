"use client";

import { useSelector } from "react-redux";
import { FiChevronLeft, FiX } from "react-icons/fi";

export default function DesktopNowPlayingPanel({ collapsed, onToggle }) {
  const track = useSelector((state) => state.player.youtubeVideo);
  const source = useSelector((state) => state.player.playbackContext?.name);

  return (
    <aside className={`now-playing-panel ${collapsed ? "is-collapsed" : ""}`} id="desktop-now-playing" aria-label="Now playing">
      <header className="now-playing-panel__header">
        {!collapsed && <h2 title={source || "Now Playing"}>{source || "Now Playing"}</h2>}
        <button type="button" onClick={onToggle} className="icon-btn"
          aria-label={collapsed ? "Open now playing panel" : "Close now playing panel"}
          title={collapsed ? "Open now playing panel" : "Close now playing panel"}>
          {collapsed ? <FiChevronLeft /> : <FiX />}
        </button>
      </header>
      <div id="kasa-now-playing-slot" hidden={collapsed} />
      {!collapsed && !track?.id ? (
        <div className="now-playing-panel__body"><p className="px-2 py-6 text-sm text-[var(--muted)]">Play a song to see it here.</p></div>
      ) : null}
    </aside>
  );
}
