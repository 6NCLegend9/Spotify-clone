import Link from "next/link";

const CATEGORIES = [
  { id: "music", title: "Music", query: "popular music playlists", colors: ["#dc148c", "#7f0b57"], mark: "♪" },
  { id: "hip-hop", title: "Hip-Hop", query: "hip hop rap playlists", colors: ["#ba5d07", "#6a3104"], mark: "HH" },
  { id: "rnb", title: "R&B", query: "r&b soul playlists", colors: ["#8d67ab", "#503b62"], mark: "R&B" },
  { id: "pop", title: "Pop", query: "pop hits playlists", colors: ["#148a08", "#0a5005"], mark: "POP" },
  { id: "afrobeats", title: "Afrobeats", query: "afrobeats playlists", colors: ["#e61e32", "#7d0d18"], mark: "AFRO" },
  { id: "amapiano", title: "Amapiano", query: "amapiano playlists", colors: ["#1e3264", "#111c38"], mark: "AMA" },
  { id: "latin", title: "Latin", query: "latin reggaeton playlists", colors: ["#e13300", "#7c1c00"], mark: "LAT" },
  { id: "dance", title: "Dance / Electronic", query: "dance electronic playlists", colors: ["#7358ff", "#382a87"], mark: "EDM" },
  { id: "rock", title: "Rock", query: "rock playlists", colors: ["#e91429", "#7c0b17"], mark: "ROCK" },
  { id: "kpop", title: "K-Pop", query: "k-pop playlists", colors: ["#f037a5", "#7c1b56"], mark: "K" },
  { id: "jazz", title: "Jazz", query: "jazz playlists", colors: ["#477d95", "#254553"], mark: "JAZZ" },
  { id: "country", title: "Country", query: "country music playlists", colors: ["#d84000", "#772300"], mark: "C" },
  { id: "chill", title: "Chill", query: "chill playlists", colors: ["#608108", "#344707"], mark: "CHILL" },
  { id: "workout", title: "Workout", query: "workout gym playlists", colors: ["#777777", "#3d3d3d"], mark: "GO" },
  { id: "focus", title: "Focus", query: "focus study playlists", colors: ["#503750", "#2b1e2b"], mark: "◎" },
  { id: "party", title: "Party", query: "party club playlists", colors: ["#af2896", "#5f1651"], mark: "★" },
  { id: "sleep", title: "Sleep", query: "sleep ambient playlists", colors: ["#1e3264", "#0f1a34"], mark: "☾" },
  { id: "throwbacks", title: "Throwbacks", query: "throwback classics playlists", colors: ["#b06239", "#633820"], mark: "90s" },
];

const QUICK_PICKS = [
  { id: "hits", title: "Today’s Hits", subtitle: "Big tracks right now", query: "top hits 2026 playlist", colors: ["#0f8a78", "#064a42"] },
  { id: "rap", title: "Rap Right Now", subtitle: "Fresh rap and hip-hop", query: "new rap hip hop 2026 playlist", colors: ["#7d4b16", "#3e250b"] },
  { id: "viral", title: "Viral", subtitle: "Songs moving fast", query: "viral songs 2026 playlist", colors: ["#a23878", "#501b3c"] },
  { id: "late", title: "Late Night R&B", subtitle: "Slow, smooth, after dark", query: "late night r&b playlist", colors: ["#344f9b", "#17244a"] },
];

function playlistHref(query) {
  return `/search/${encodeURIComponent(query)}?type=playlist`;
}

export default function BrowseAll() {
  return (
    <main className="page mx-auto w-full max-w-[1500px] text-gray-200">
      <header className="mb-5 pt-0 sm:mb-7">
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Search</h1>
        <p className="mt-1.5 text-sm text-[var(--muted)]">Browse playlists by genre, mood, or style.</p>
      </header>
      <section aria-labelledby="browse-all-title">
        <h2 id="browse-all-title" className="mb-4 text-xl font-bold text-white sm:text-2xl">Browse all</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
          {CATEGORIES.map((category) => (
            <Link key={category.id} href={playlistHref(category.query)}
              className="group relative min-h-[108px] overflow-hidden rounded-lg p-4 shadow-lg transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:min-h-[142px]"
              style={{ background: `linear-gradient(135deg, ${category.colors[0]}, ${category.colors[1]})` }}
              aria-label={`Browse ${category.title} playlists`}>
              <h3 className="relative z-10 max-w-[75%] text-base font-extrabold leading-tight text-white sm:text-xl">{category.title}</h3>
              <span aria-hidden="true"
                className="absolute -bottom-3 -right-3 grid h-[72px] w-[72px] rotate-[18deg] place-items-center rounded-md bg-black/25 text-lg font-black text-white/90 shadow-xl transition duration-300 group-hover:rotate-[13deg] group-hover:scale-105 sm:h-[88px] sm:w-[88px] sm:text-xl">
                {category.mark}
              </span>
            </Link>
          ))}
        </div>
      </section>
      <section className="mt-8 pb-8" aria-labelledby="quick-picks-title">
        <h2 id="quick-picks-title" className="mb-4 text-xl font-bold text-white sm:text-2xl">Popular playlists</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {QUICK_PICKS.map((pick) => (
            <Link key={pick.id} href={playlistHref(pick.query)}
              className="group flex min-h-[88px] items-center justify-between overflow-hidden rounded-lg border border-white/10 p-4 transition hover:border-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              style={{ background: `linear-gradient(120deg, ${pick.colors[1]}, ${pick.colors[0]})` }}>
              <span className="min-w-0"><span className="block truncate text-base font-bold text-white">{pick.title}</span><span className="mt-1 block truncate text-xs text-white/70">{pick.subtitle}</span></span>
              <span aria-hidden="true" className="ml-3 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-black/25 text-sm text-white transition group-hover:bg-white group-hover:text-black">▶</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
