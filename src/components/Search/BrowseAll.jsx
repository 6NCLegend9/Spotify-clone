import Link from "next/link";

const CATEGORIES = [
  { id: "music", title: "Music", query: "popular music playlists", colors: ["#096192", "#1171ba"], ink: "#fff", mark: "♪" },
  { id: "hip-hop", title: "Hip-Hop", query: "hip hop rap playlists", colors: ["#1171ba", "#096192"], ink: "#fff", mark: "HH" },
  { id: "rnb", title: "R&B", query: "r&b soul playlists", colors: ["#1399c6", "#24aae2"], ink: "#030814", mark: "R&B" },
  { id: "pop", title: "Pop", query: "pop hits playlists", colors: ["#24aae2", "#1399c6"], ink: "#030814", mark: "POP" },
  { id: "afrobeats", title: "Afrobeats", query: "afrobeats playlists", colors: ["#0e8c7f", "#1399c6"], ink: "#030814", mark: "AFRO" },
  { id: "amapiano", title: "Amapiano", query: "amapiano playlists", colors: ["#096192", "#1171ba"], ink: "#fff", mark: "AMA" },
  { id: "latin", title: "Latin", query: "latin reggaeton playlists", colors: ["#1171ba", "#096192"], ink: "#fff", mark: "LAT" },
  { id: "dance", title: "Dance / Electronic", query: "dance electronic playlists", colors: ["#1399c6", "#24aae2"], ink: "#030814", mark: "EDM" },
  { id: "rock", title: "Rock", query: "rock playlists", colors: ["#24aae2", "#1399c6"], ink: "#030814", mark: "ROCK" },
  { id: "kpop", title: "K-Pop", query: "k-pop playlists", colors: ["#0e8c7f", "#1399c6"], ink: "#030814", mark: "K" },
  { id: "jazz", title: "Jazz", query: "jazz playlists", colors: ["#096192", "#1171ba"], ink: "#fff", mark: "JAZZ" },
  { id: "country", title: "Country", query: "country music playlists", colors: ["#1171ba", "#096192"], ink: "#fff", mark: "C" },
  { id: "chill", title: "Chill", query: "chill playlists", colors: ["#1399c6", "#24aae2"], ink: "#030814", mark: "CHILL" },
  { id: "workout", title: "Workout", query: "workout gym playlists", colors: ["#24aae2", "#1399c6"], ink: "#030814", mark: "GO" },
  { id: "focus", title: "Focus", query: "focus study playlists", colors: ["#0e8c7f", "#1399c6"], ink: "#030814", mark: "◎" },
  { id: "party", title: "Party", query: "party club playlists", colors: ["#096192", "#1171ba"], ink: "#fff", mark: "★" },
  { id: "sleep", title: "Sleep", query: "sleep ambient playlists", colors: ["#1171ba", "#096192"], ink: "#fff", mark: "☾" },
  { id: "throwbacks", title: "Throwbacks", query: "throwback classics playlists", colors: ["#1399c6", "#24aae2"], ink: "#030814", mark: "90s" },
];

const QUICK_PICKS = [
  { id: "hits", title: "Today’s Hits", subtitle: "Big tracks right now", query: "top hits 2026 playlist", colors: ["#24aae2", "#1399c6"], ink: "#030814" },
  { id: "rap", title: "Rap Right Now", subtitle: "Fresh rap and hip-hop", query: "new rap hip hop 2026 playlist", colors: ["#0e8c7f", "#1399c6"], ink: "#030814" },
  { id: "viral", title: "Viral", subtitle: "Songs moving fast", query: "viral songs 2026 playlist", colors: ["#096192", "#1171ba"], ink: "#fff" },
  { id: "late", title: "Late Night R&B", subtitle: "Slow, smooth, after dark", query: "late night r&b playlist", colors: ["#1171ba", "#096192"], ink: "#fff" },
];

function playlistHref(query) {
  return `/search/${encodeURIComponent(query)}?type=playlist`;
}

export default function BrowseAll() {
  return (
    <main className="page page-search mx-auto w-full max-w-[1500px] text-gray-200">
      <header className="mb-5 pt-0 sm:mb-7">
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Search</h1>
        <p className="mt-1.5 text-sm text-[var(--muted)]">Browse playlists by genre, mood, or style.</p>
      </header>
      <section aria-labelledby="browse-all-title">
        <h2 id="browse-all-title" className="mb-4 text-xl font-bold text-white sm:text-2xl">Browse all</h2>
        <div className="browse-grid">
          {CATEGORIES.map((category) => (
            <Link key={category.id} href={playlistHref(category.query)}
              className="browse-category group relative overflow-hidden rounded-xl p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--text)]"
              style={{ background: `linear-gradient(135deg, ${category.colors[0]}, ${category.colors[1]})`, color: category.ink }}
              aria-label={`Browse ${category.title} playlists`}>
              <h3 className="relative z-10 max-w-[85%] text-base font-semibold leading-snug">{category.title}</h3>
              <span aria-hidden="true"
                className="absolute -bottom-3 -right-3 grid h-[72px] w-[72px] rotate-[18deg] place-items-center rounded-md bg-white/10 text-lg font-black shadow-xl transition duration-300 group-hover:rotate-[13deg] group-hover:scale-105 sm:h-[88px] sm:w-[88px] sm:text-xl">
                {category.mark}
              </span>
            </Link>
          ))}
        </div>
      </section>
      <section className="mt-8 pb-8" aria-labelledby="quick-picks-title">
        <h2 id="quick-picks-title" className="mb-4 text-xl font-bold text-white sm:text-2xl">Popular playlists</h2>
        <div className="browse-picks">
          {QUICK_PICKS.map((pick) => (
            <Link key={pick.id} href={playlistHref(pick.query)}
              className="group flex min-h-[88px] items-center justify-between overflow-hidden rounded-lg border border-white/10 p-4 transition hover:border-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              style={{ background: `linear-gradient(120deg, ${pick.colors[1]}, ${pick.colors[0]})`, color: pick.ink }}>
              <span className="min-w-0"><span className="block truncate text-base font-bold">{pick.title}</span><span className="mt-1 block truncate text-xs opacity-90">{pick.subtitle}</span></span>
              <span aria-hidden="true" className="ml-3 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-black/25 text-sm text-white transition group-hover:bg-white group-hover:text-black">▶</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
