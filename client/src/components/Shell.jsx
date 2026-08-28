import { useState } from "react";
import { Icon } from "./Icon";
import { PlayerBar } from "./PlayerBar";
import { CreatePlaylistModal } from "./CreatePlaylistModal";
import { SidebarNav } from "./SidebarNav";
import { TopNavSearch } from "./TopNavSearch";
import { useHashRoute } from "../hooks/useHashRoute";

const viewTitles = {
  home: "Home",
  search: "Search",
  library: "Your Library",
  playlistDetail: "Playlist",
  trackDetail: "Now playing",
  youtubeVideoDetail: "YouTube video",
  artistDetail: "Artist",
  albumDetail: "Album",
  charts: "Charts",
  radioStation: "Radio",
  genre: "Browse genre",
  settings: "Settings",
};

export function Shell({ children }) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const { view } = useHashRoute();
  const title = viewTitles[view] || "Musicon";

  return <div className="app-shell">
    <aside className={`sidebar ${navigationOpen ? "is-open" : ""}`}><div className="brand"><span className="brand-mark">M</span><span>usicon</span></div><SidebarNav onCreate={() => setCreatingPlaylist(true)} onNavigate={() => setNavigationOpen(false)} /><div className="sidebar-footer"><span>Music sources</span><small>Spotify catalog + live YouTube videos.</small></div></aside>
    {navigationOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setNavigationOpen(false)} />}
    <main className="main-area"><TopNavSearch title={title} onOpenNavigation={() => setNavigationOpen(true)} /><section className="content">{children}</section><footer className="app-note">Musicon combines Spotify catalog metadata with live YouTube video discovery. Playback stays inside official embedded players.</footer></main>
    <PlayerBar />
    {creatingPlaylist && <CreatePlaylistModal onClose={() => setCreatingPlaylist(false)} />}
  </div>;
}
