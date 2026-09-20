"use client";

import { useEffect, useMemo, useState } from "react";
import ContextMenuTarget from "@/components/ContextMenuTarget";
import PlaylistItemMenu from "@/components/PlaylistItemMenu";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useDispatch } from "react-redux";
import toast from "react-hot-toast";
import {
  FiChevronDown,
  FiGrid,
  FiHeart,
  FiList,
  FiLock,
  FiPlus,
  FiUsers,
  FiZap,
} from "react-icons/fi";
import { BsPinAngleFill } from "react-icons/bs";
import PlaylistModal from "@/components/Sidebar/PlaylistModal";
import PlaylistCover from "@/components/PlaylistCover";
import LikePlaylistButton from "@/components/LikePlaylistButton";
import MediaImage from "@/components/MediaImage";
import EmptyState from "@/components/EmptyState";
import UserMessage from "@/components/UserMessage";
import { CardGridSkeleton } from "@/components/Skeleton";
import { cleanTitle } from "@/utils/text";
import { getUserPlaylists } from "@/services/playlistApi";
import { requestJson } from "@/services/http";
import { startYoutubePlayback } from "@/redux/features/playerSlice";
import {
  getFavouriteLibrary,
  getPublicLibrary,
  hydrateYouTubeTracks,
  validYouTubeIds,
} from "@/services/libraryApi";
import { PLAYLIST_CATEGORIES } from "@/utils/playlistThemes";
import { toUserError } from "@/utils/userError";
import { readNavCache, writeNavCache } from "@/utils/navCache";
import { accountOwner } from "@/utils/accountCache.mjs";

const SORT_OPTIONS = [
  ["recents", "Recents"],
  ["added", "Recently Added"],
  ["alphabetical", "Alphabetical"],
  ["creator", "Creator"],
];

const LIBRARY_CACHE_KEY = "library";

function relativeDate(value) {
  if (!value) return "Not updated yet";
  const elapsed = Date.now() - new Date(value).getTime();
  const days = Math.max(0, Math.floor(elapsed / 86400000));
  if (days === 0) return "Updated today";
  if (days === 1) return "Updated yesterday";
  if (days < 30) return `Updated ${days} days ago`;
  return `Updated ${new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function ownerDetails(playlist, currentUserId) {
  const ownerId = playlist.user?._id || playlist.user;
  const ownedByUser = ownerId?.toString() === currentUserId;
  return {
    ownedByUser,
    creator: ownedByUser ? "You" : playlist.user?.userName || "HayKasa listener",
  };
}

function CollectionBadges({ item }) {
  return (
    <div className="mt-3 flex min-h-6 flex-wrap items-center gap-2 text-[10px] font-semibold uppercase text-gray-300">
      {item.pinned && (
        <span className="inline-flex items-center gap-1"><BsPinAngleFill className="text-[#00e6e6]" /> Pinned</span>
      )}
      {item.smartShuffle && (
        <span className="inline-flex items-center gap-1"><FiZap className="text-emerald-400" /> Smart Shuffle</span>
      )}
      {item.collaborative && (
        <span className="inline-flex items-center gap-1"><FiUsers /> Collaborative</span>
      )}
    </div>
  );
}

function CollectionCover({ item }) {
  if (item.type === "liked") {
    return (
      <div className="grid aspect-square w-full place-items-center bg-gradient-to-br from-[#3426a8] via-[#654be5] to-[#b9e7e5]">
        <FiHeart className="h-16 w-16 fill-white text-white" />
      </div>
    );
  }
  return <PlaylistCover playlist={item} />;
}

function GridItem({ item }) {
  return (
    <ContextMenuTarget className="library-tile group relative min-w-0">
      <Link href={item.href} className="block focus-visible:outline-none">
        <div className="overflow-hidden rounded-[4px] shadow-xl">
          <CollectionCover item={item} />
        </div>
        <h2 className="home-shelf-title mt-3">{cleanTitle(item.title)}</h2>
        <p className="home-shelf-subtitle">{item.meta}</p>
        <p className="mt-1 truncate text-xs text-gray-500">{item.updatedLabel}</p>
        {item.category && item.type === "playlist" ? (
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-[#00e6e6]">{item.category}{item.subgenre ? ` · ${item.subgenre}` : ""}</p>
        ) : null}
        <CollectionBadges item={item} />
      </Link>
      {item.type === "playlist" ? (
        <div className="absolute right-2 top-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
          <LikePlaylistButton playlist={item} className="bg-black/50 backdrop-blur" />
        </div>
      ) : null}
      {item.type === "playlist" && <PlaylistItemMenu playlist={item} className="absolute bottom-2 right-2 bg-black/60" />}
    </ContextMenuTarget>
  );
}

function ListItem({ item }) {
  return (
    <ContextMenuTarget className="group grid min-h-[76px] grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 py-2 transition duration-200 ease-out hover:bg-white/[0.07] sm:grid-cols-[64px_minmax(0,1fr)_minmax(150px,0.6fr)_auto]">
      <Link href={item.href} className="contents">
        <div className="overflow-hidden rounded-[4px]"><CollectionCover item={item} /></div>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-white sm:text-base">{cleanTitle(item.title)}</h2>
          <p className="mt-1 truncate text-xs text-gray-400">{item.meta}{item.category ? ` · ${item.category}` : ""}</p>
        </div>
        <p className="hidden truncate text-xs text-gray-400 sm:block">{item.updatedLabel}</p>
      </Link>
      {item.type === "playlist" ? <div className="flex"><LikePlaylistButton playlist={item} /><PlaylistItemMenu playlist={item} /></div> : <CollectionBadges item={item} />}
    </ContextMenuTarget>
  );
}

function GuestLibrary({ playlists, loading, error, onRetry }) {
  const dispatch = useDispatch();
  const [loadingId, setLoadingId] = useState(null);

  const playPlaylist = async (playlist) => {
    if (loadingId) return;
    setLoadingId(playlist.id);
    try {
      const data = await requestJson(`/api/youtube-playlist?id=${encodeURIComponent(playlist.id)}`, {
        fallbackTitle: "Playlist unavailable",
        fallbackMessage: "We couldn’t load this playlist. Please try again.",
      });
      const tracks = Array.isArray(data?.tracks) ? data.tracks : [];
      if (tracks.length === 0) {
        toast.error("This playlist has no playable videos.");
        return;
      }
      const seeded = tracks.map((track) => ({
        ...track,
        seedQuery: playlist.title,
        genre: playlist.title,
      }));
      dispatch(startYoutubePlayback({
        queue: seeded,
        track: seeded[0],
        queueMode: "collection",
        autoExtend: false,
        context: {
          type: "playlist",
          id: String(playlist.id),
          name: playlist.title || "Playlist",
        },
      }));
    } catch (playError) {
      toast.error(toUserError(playError, {
        title: "Playlist unavailable",
        message: "We couldn’t load this playlist. Please try again.",
      }).message);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <>
      <section className="glass-panel mt-2 flex flex-col gap-5 rounded-2xl px-5 py-7 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="flex min-w-0 items-start gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 text-[#00e6e6]"><FiLock /></span>
          <div>
            <h2 className="text-xl font-bold text-white">Keep every favorite within reach</h2>
            <p className="mt-2 max-w-xl text-sm text-gray-300">Save your favorite tracks in one place. Log in or create a free account.</p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link href="/login" className="btn-primary h-10 px-5 text-sm">Log in</Link>
          <Link href="/signup" className="btn-ghost h-10 px-5 text-sm">Sign up</Link>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="featured-public-playlists">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase text-[#00e6e6]">Public playlists</p>
          <h2 id="featured-public-playlists" className="mt-2 text-2xl font-bold text-white">Featured for everyone</h2>
        </div>
        {loading && <CardGridSkeleton count={5} />}
        {!loading && error && (
          <UserMessage
            title={error.title}
            message={error.message}
            onRetry={onRetry}
          />
        )}
        {!loading && !error && playlists.length === 0 && (
          <EmptyState
            title="No featured playlists right now"
            message="Check back soon for more music."
          />
        )}
        {!loading && !error && playlists.length > 0 && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
            {playlists.map((playlist) => (
            <button
              key={playlist.id}
              type="button"
              onClick={() => playPlaylist(playlist)}
              disabled={loadingId === playlist.id}
              className="library-tile group min-w-0 text-left disabled:opacity-60"
            >
              <MediaImage src={playlist.thumbnail} size="hq" alt="" className="aspect-square w-full rounded-[4px] object-cover" />
              <div className="mt-4 min-w-0">
                <h3 className="line-clamp-2 text-sm font-bold text-white">{cleanTitle(playlist.title, "Untitled playlist")}</h3>
                <p className="mt-2 truncate text-xs text-gray-400">{loadingId === playlist.id ? "Loading..." : playlist.channel}</p>
              </div>
            </button>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

export default function LibraryView() {
  const { data: session, status } = useSession();
  const owner = accountOwner(session, status);
  return <AccountLibraryView key={owner || status} session={session} status={status} owner={owner} />;
}

function AccountLibraryView({ session, status, owner }) {
  const cacheKey = `${LIBRARY_CACHE_KEY}:${owner}`;
  const cached = owner ? readNavCache(cacheKey) : null;
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState("grid");
  const [sort, setSort] = useState("recents");
  const [favourites, setFavourites] = useState(() => cached?.favourites ?? null);
  const [playlists, setPlaylists] = useState(() => cached?.playlists ?? []);
  const [publicPlaylists, setPublicPlaylists] = useState(() => cached?.publicPlaylists ?? []);
  const [covers, setCovers] = useState(() => cached?.covers ?? {});
  const [loading, setLoading] = useState(() => !cached);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const onPlaylistsChanged = () => setRefreshKey((value) => value + 1);
    window.addEventListener("heykasa:playlists-changed", onPlaylistsChanged);
    return () => window.removeEventListener("heykasa:playlists-changed", onPlaylistsChanged);
  }, []);

  useEffect(() => {
    if (!owner) return;
    let active = true;

    const loadLibrary = async () => {
      if (!readNavCache(cacheKey)) setLoading(true);
      setError(null);
      try {
        if (status === "unauthenticated") {
          const publicData = await getPublicLibrary();
          if (active) {
            const nextPublic = Array.isArray(publicData?.sections?.featuredPlaylists)
              ? publicData.sections.featuredPlaylists.filter(
                (playlist) => playlist && typeof playlist === "object" && playlist.id,
              )
              : [];
            setPublicPlaylists(nextPublic);
            writeNavCache(cacheKey, {
              favourites: null,
              playlists: [],
              publicPlaylists: nextPublic,
              covers: {},
            });
          }
          return;
        }

        const [favouriteData, playlistData] = await Promise.all([
          getFavouriteLibrary(),
          getUserPlaylists(),
        ]);
        if (!playlistData?.success) throw playlistData;
        const nextPlaylists = Array.isArray(playlistData.data?.playlists)
          ? playlistData.data.playlists.filter(
            (playlist) => playlist && typeof playlist === "object" && playlist._id,
          )
          : [];
        const coverIds = nextPlaylists.map((playlist) => validYouTubeIds(playlist.songs)[0]).filter(Boolean);
        let coverTracks = [];
        try {
          coverTracks = await hydrateYouTubeTracks(coverIds);
        } catch {
          // Covers are optional; keep the loaded collections usable.
        }
        if (active) {
          const nextCovers = Object.fromEntries(coverTracks.map((track) => [track.id, track.thumbnail]));
          setFavourites(favouriteData);
          setPlaylists(nextPlaylists);
          setCovers(nextCovers);
          writeNavCache(cacheKey, {
            favourites: favouriteData,
            playlists: nextPlaylists,
            publicPlaylists: [],
            covers: nextCovers,
          });
        }
      } catch (loadError) {
        if (active) {
          const normalized = toUserError(loadError);
          setError(normalized.code === "UNAUTHORIZED"
            ? normalized
            : toUserError(loadError, {
              title: "Library unavailable",
              message: "We couldn’t load your library. Please try again.",
            }));
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadLibrary();
    return () => {
      active = false;
    };
  }, [status, refreshKey, owner, cacheKey]);

  const items = useMemo(() => {
    if (status !== "authenticated" || !favourites) return [];
    const currentUserId = session?.user?.id;
    const favouriteIds = validYouTubeIds(favourites.favourites);
    const likedDates = Object.values(favourites.favouriteAddedAt || {}).filter(Boolean);
    const likedUpdatedAt = likedDates.sort().at(-1) || favourites.updatedAt;
    const likedItem = {
      id: "liked",
      type: "liked",
      href: "/library/liked",
      title: "Liked Songs",
      meta: `${favouriteIds.length.toLocaleString()} ${favouriteIds.length === 1 ? "song" : "songs"}`,
      updatedAt: likedUpdatedAt,
      createdAt: favourites.createdAt,
      updatedLabel: relativeDate(likedUpdatedAt),
      creator: "You",
      pinned: true,
    };
    const playlistItems = playlists.map((playlist) => {
      const { ownedByUser, creator } = ownerDetails(playlist, currentUserId);
      const songIds = validYouTubeIds(playlist.songs);
      return {
        ...playlist,
        id: playlist._id,
        type: "playlist",
        href: `/library/playlist/${playlist._id}`,
        title: playlist.name,
        creator,
        ownedByUser,
        collaborative: (playlist.collaborators?.length || 0) > 0,
        meta: `${ownedByUser ? "By You" : `By ${creator}`} • ${songIds.length.toLocaleString()} ${songIds.length === 1 ? "song" : "songs"}`,
        updatedLabel: relativeDate(playlist.updatedAt),
        cover: playlist.coverImage || covers[songIds[0]],
      };
    });

    const visible = playlistItems.filter((item) => {
      if (filter === "by-you") return item.ownedByUser;
      if (filter === "liked") return Boolean(item.liked);
      if (PLAYLIST_CATEGORIES.includes(filter)) return item.category === filter;
      return true;
    });
    visible.sort((left, right) => {
      if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
      if (sort === "alphabetical") return left.title.localeCompare(right.title);
      if (sort === "creator") return left.creator.localeCompare(right.creator);
      if (sort === "added") return new Date(right.createdAt || 0) - new Date(left.createdAt || 0);
      return new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0);
    });
    return filter === "all" ? [likedItem, ...visible] : visible;
  }, [covers, favourites, filter, playlists, session?.user?.id, sort, status]);

  return (
    <main className="page text-white">
      <header className="page-hero">
        <div>
          <p className="eyebrow">Your collection</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Your Library</h1>
          <p className="mt-2 text-sm text-[#9aa8b5]">Saved music and playlists, organized your way.</p>
        </div>
        {status === "authenticated" && (
          <button type="button" onClick={() => setShowCreate(true)} className="btn-primary h-10 px-4 text-sm">
            <FiPlus /> New playlist
          </button>
        )}
      </header>

      {status === "loading" ? (
        <div className="mt-8"><CardGridSkeleton /></div>
      ) : status !== "authenticated" ? (
        <GuestLibrary
          playlists={publicPlaylists}
          loading={loading}
          error={error}
          onRetry={() => setRefreshKey((value) => value + 1)}
        />
      ) : (
        <>
          <section className="mt-8 flex flex-col gap-4 border-y border-white/10 py-4 lg:flex-row lg:items-center lg:justify-between" aria-label="Library controls">
            <div className="flex flex-wrap gap-2" aria-label="Library filters">
              {[["all", "All"], ["playlists", "Playlists"], ["by-you", "By You"], ["liked", "Liked"]].map(([value, label]) => (
                <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`home-chip ${filter === value ? "is-active" : ""}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative flex items-center">
                <span className="sr-only">Filter by playlist type</span>
                <select
                  value={PLAYLIST_CATEGORIES.includes(filter) ? filter : ""}
                  onChange={(event) => setFilter(event.target.value || "playlists")}
                  className="h-10 appearance-none rounded-full border border-white/10 bg-[#0b1722] py-0 pl-3 pr-9 text-xs font-semibold text-white outline-none focus:border-[#00e6e6]"
                >
                  <option value="">All types</option>
                  {PLAYLIST_CATEGORIES.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
                <FiChevronDown className="pointer-events-none absolute right-3 text-gray-400" />
              </label>
              <div className="flex rounded-md bg-white/[0.07] p-1" aria-label="Library view">
                <button type="button" aria-label="Grid view" title="Grid view" aria-pressed={view === "grid"} onClick={() => setView("grid")} className={`grid h-11 w-11 place-items-center rounded sm:h-9 sm:w-9 ${view === "grid" ? "bg-white text-black" : "text-gray-300 hover:text-white"}`}><FiGrid /></button>
                <button type="button" aria-label="List view" title="List view" aria-pressed={view === "list"} onClick={() => setView("list")} className={`grid h-11 w-11 place-items-center rounded sm:h-9 sm:w-9 ${view === "list" ? "bg-white text-black" : "text-gray-300 hover:text-white"}`}><FiList /></button>
              </div>
              <label className="relative flex items-center">
                <span className="sr-only">Sort library</span>
                <select value={sort} onChange={(event) => setSort(event.target.value)} className="h-10 appearance-none rounded-md border border-white/10 bg-[#0b1722] py-0 pl-3 pr-9 text-xs font-semibold text-white outline-none focus:border-[#00e6e6]">
                  {SORT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <FiChevronDown className="pointer-events-none absolute right-3 text-gray-400" />
              </label>
            </div>
          </section>

          {loading && items.length === 0 && <div className="mt-6"><CardGridSkeleton /></div>}
          {!loading && error && (
            <div className="mt-8">
              <UserMessage
                title={error.title}
                message={error.message}
                onRetry={() => setRefreshKey((value) => value + 1)}
                href={error.action === "login" ? "/login" : undefined}
                hrefLabel="Log in"
              />
            </div>
          )}
          {!loading && !error && items.length === 0 && (
            <div className="mt-8">
              <EmptyState
                title="No playlists here yet"
                message={filter === "all" ? "Create a playlist to start building your library." : "Try another filter or create a new playlist."}
                actionLabel={filter === "all" ? "Create playlist" : "Show all"}
                onAction={filter === "all" ? () => setShowCreate(true) : () => setFilter("all")}
              />
            </div>
          )}
          {!loading && !error && view === "grid" && (
            <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4" aria-label="Library collections">
              {items.map((item) => <GridItem key={item.id} item={item} />)}
            </section>
          )}
          {!loading && !error && view === "list" && (
            <section className="mt-6 space-y-1" aria-label="Library collections">
              {items.map((item) => <ListItem key={item.id} item={item} />)}
            </section>
          )}
        </>
      )}
      <PlaylistModal show={showCreate} setShow={setShowCreate} onCreated={() => setRefreshKey((value) => value + 1)} />
    </main>
  );
}

