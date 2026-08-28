import { PlayerProvider } from "./context/PlayerContext";
import { LibraryProvider } from "./context/LibraryContext";
import { ToastProvider } from "./context/ToastContext";
import { UserProvider } from "./context/UserContext";
import { useHashRoute } from "./hooks/useHashRoute";
import { Shell } from "./components/Shell";
import { Home } from "./views/Home";
import { Search } from "./views/Search";
import { Library } from "./views/Library";
import { Settings } from "./views/Settings";
import { PlaylistDetail } from "./views/PlaylistDetail";
import { Genre } from "./views/Genre";
import { TrackDetail } from "./views/TrackDetail";
import { YouTubeVideoDetail } from "./views/YouTubeVideoDetail";
import { ArtistDetail } from "./views/ArtistDetail";
import { AlbumDetail } from "./views/AlbumDetail";
import { Charts } from "./views/Charts";
import { RadioStation } from "./views/RadioStation";

function View() {
  const { view } = useHashRoute();
  if (view === "search") return <Search />;
  if (view === "library") return <Library />;
  if (view === "settings") return <Settings />;
  if (view === "playlistDetail") return <PlaylistDetail />;
  if (view === "trackDetail") return <TrackDetail />;
  if (view === "youtubeVideoDetail") return <YouTubeVideoDetail />;
  if (view === "artistDetail") return <ArtistDetail />;
  if (view === "albumDetail") return <AlbumDetail />;
  if (view === "charts") return <Charts />;
  if (view === "radioStation") return <RadioStation />;
  if (view === "genre") return <Genre />;
  return <Home />;
}

export default function App() {
  return <ToastProvider><UserProvider><LibraryProvider><PlayerProvider><Shell><View /></Shell></PlayerProvider></LibraryProvider></UserProvider></ToastProvider>;
}
