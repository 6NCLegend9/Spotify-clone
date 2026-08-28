import { useEffect, useState } from "react";
import { useHashRoute, navigate } from "../hooks/useHashRoute";
import { useGroupedSearch } from "../hooks/useGroupedSearch";
import { useToast } from "../context/ToastContext";
import { useUser } from "../context/UserContext";
import { api } from "../lib/api";
import { Icon } from "./Icon";

function initials(name) {
  return String(name || "Demo Listener").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function destinationForSuggestion(suggestion) {
  if (suggestion.kind === "track") return `/track/${suggestion.id}`;
  if (suggestion.kind === "artist") return `/artist/${suggestion.id}`;
  if (suggestion.kind === "album") return `/album/${suggestion.id}`;
  if (suggestion.kind === "playlist") return `/playlist/${suggestion.id}`;
  return `/search?q=${encodeURIComponent(suggestion.queryText)}`;
}

export function TopNavSearch({ title, onOpenNavigation }) {
  const { query: routeQuery } = useHashRoute();
  const { user, status, error, loginDemo, logout } = useUser();
  const { notify } = useToast();
  const [query, setQuery] = useState(routeQuery.q || "");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const groupedSearch = useGroupedSearch(query, 4);
  const suggestions = query.trim() ? [
    ...groupedSearch.tracks.map((track) => ({ ...track, kind: "track", label: track.title, detail: track.artistName, image: track.coverUrl })),
    ...groupedSearch.artists.map((artist) => ({ ...artist, kind: "artist", label: artist.name, detail: "Artist", image: artist.avatarUrl })),
    ...groupedSearch.albums.map((album) => ({ ...album, kind: "album", label: album.title, detail: album.artistName, image: album.coverUrl })),
    ...groupedSearch.playlists.map((playlist) => ({ ...playlist, kind: "playlist", label: playlist.name, detail: "Playlist", image: playlist.coverUrl })),
  ].slice(0, 10) : recentSearches.map((item) => ({ ...item, kind: "recent", label: item.queryText, detail: `Recent ${item.queryType || "search"}`, image: "" }));

  useEffect(() => {
    setQuery(routeQuery.q || "");
  }, [routeQuery.q]);

  useEffect(() => {
    setActiveSuggestion(-1);
  }, [query]);

  useEffect(() => {
    if (!suggestionsOpen || query.trim()) return;
    let active = true;
    const loadRecentSearches = async () => {
      setRecentLoading(true);
      try {
        const response = await api.get("/api/search/recent?limit=6");
        if (active) setRecentSearches(response.data || []);
      } catch {
        if (active) setRecentSearches([]);
      } finally {
        if (active) setRecentLoading(false);
      }
    };
    loadRecentSearches();
    return () => { active = false; };
  }, [suggestionsOpen, query]);

  const submit = (event) => {
    event.preventDefault();
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;
    navigate(`/search?q=${encodeURIComponent(trimmedQuery)}`);
    setSuggestionsOpen(false);
    setActiveSuggestion(-1);
  };

  const chooseSuggestion = (suggestion) => {
    navigate(destinationForSuggestion(suggestion));
    setSuggestionsOpen(false);
    setActiveSuggestion(-1);
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === "Escape") {
      setQuery("");
      setSuggestionsOpen(false);
      setActiveSuggestion(-1);
      return;
    }
    if (!suggestions.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSuggestion((current) => (current + 1) % suggestions.length);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSuggestion((current) => current <= 0 ? suggestions.length - 1 : current - 1);
    }
    if (event.key === "Enter" && activeSuggestion >= 0) {
      event.preventDefault();
      chooseSuggestion(suggestions[activeSuggestion]);
    }
  };

  const endSession = async () => {
    try {
      await logout();
      notify("Demo session ended");
    } catch {
      notify("Unable to end the demo session", "error");
    } finally {
      setProfileOpen(false);
    }
  };

  const beginSession = async () => {
    try {
      await loginDemo();
      notify("Demo session restored", "success");
    } catch {
      notify("Unable to start the demo session", "error");
    }
  };

  return <header className="topbar">
    <div className="topbar-title"><button className="mobile-menu-button icon-button" aria-label="Open navigation" title="Open navigation" onClick={onOpenNavigation}><Icon name="menu" /></button><div><span className="eyebrow">LISTEN DEEPLY</span><h1>{title}</h1></div></div>
    <form className="search-box" role="search" onSubmit={submit}><Icon name="search" /><input value={query} onFocus={() => setSuggestionsOpen(true)} onChange={(event) => { setQuery(event.target.value); setSuggestionsOpen(true); }} onKeyDown={handleSearchKeyDown} placeholder="Search artists, songs, or playlists" aria-label="Search artists, songs, or playlists" aria-expanded={suggestionsOpen} aria-controls="search-suggestions" aria-activedescendant={activeSuggestion >= 0 ? `search-suggestion-${activeSuggestion}` : undefined} />{suggestionsOpen && <div className="search-suggestions" id="search-suggestions" role="listbox">{query.trim() && groupedSearch.loading && <p>Searching...</p>}{!query.trim() && recentLoading && <p>Loading recent searches...</p>}{suggestions.map((suggestion, index) => <button id={`search-suggestion-${index}`} className={activeSuggestion === index ? "is-active" : ""} key={`${suggestion.kind}-${suggestion.id || suggestion.queryText}-${index}`} role="option" aria-selected={activeSuggestion === index} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActiveSuggestion(index)} onClick={() => chooseSuggestion(suggestion)}>{suggestion.image ? <img src={suggestion.image} alt="" /> : <span className="search-suggestion-icon"><Icon name="search" /></span>}<span><strong>{suggestion.label}</strong><small>{suggestion.detail}</small></span></button>)}{!groupedSearch.loading && !recentLoading && !suggestions.length && <p>{query.trim() ? "No matching results" : "No recent searches"}</p>}</div>}</form>
    <div className="profile-control"><button className="avatar" aria-label="Open profile menu" aria-expanded={profileOpen} onClick={() => setProfileOpen((value) => !value)}>{user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : initials(user?.displayName)}</button>{profileOpen && <div className="profile-menu"><strong>{user?.displayName || "Demo listener"}</strong><small>{user?.email || "Session loading"}</small><button onClick={() => { navigate("/settings"); setProfileOpen(false); }}><Icon name="settings" />Settings</button>{user ? <button onClick={endSession}><Icon name="close" />End demo session</button> : <button onClick={beginSession}>Start demo session</button>}</div>}</div>
    {status === "ready" && error && <span className="session-warning" role="status">Saved data offline</span>}
  </header>;
}