import Link from "next/link";

const HOT_PLAYLISTS = [
  {
    id: "global-heat",
    eyebrow: "TRENDING NOW",
    title: "Global Heat",
    description: "The tracks moving everywhere right now.",
    query: "global hits 2026 playlist",
    colors: ["#ff4d8d", "#e1118c", "#68104f"],
    art: "🔥",
  },
  {
    id: "rap-radar",
    eyebrow: "FRESH RAP",
    title: "Rap Radar",
    description: "New bars, heavy bass and names on the rise.",
    query: "new rap hip hop hits 2026",
    colors: ["#ff8a00", "#e13300", "#571400"],
    art: "⚡",
  },
  {
    id: "afro-wave",
    eyebrow: "AFRO NOW",
    title: "Afro Wave",
    description: "Afrobeats, amapiano and pure summer motion.",
    query: "afrobeats amapiano hits 2026 playlist",
    colors: ["#ffd166", "#f77f00", "#7a2900"],
    art: "☀",
  },
  {
    id: "dancehall-fire",
    eyebrow: "ISLAND ENERGY",
    title: "Dancehall Fire",
    description: "Fresh Jamaican heat built for loud speakers.",
    query: "dancehall reggae hits 2026 playlist",
    colors: ["#00e6a8", "#008b72", "#003d38"],
    art: "🌴",
  },
  {
    id: "pop-now",
    eyebrow: "CHART POP",
    title: "Pop Right Now",
    description: "Big hooks and the songs everyone knows.",
    query: "top pop hits 2026 playlist",
    colors: ["#8b7cff", "#6b38d1", "#24134f"],
    art: "✦",
  },
  {
    id: "late-night-rnb",
    eyebrow: "AFTER DARK",
    title: "Midnight R&B",
    description: "Smooth voices for the hours after midnight.",
    query: "late night r&b chill playlist",
    colors: ["#3f8cff", "#17478f", "#061b3d"],
    art: "☾",
  },
];

const VIBE_PLAYLISTS = [
  {
    id: "cold",
    title: "Cold Mode",
    subtitle: "Clean, calm, untouchable.",
    query: "cold vibe chill playlist",
    colors: ["#66e3ff", "#1778a6", "#072940"],
    icon: "❄",
  },
  {
    id: "night-drive",
    title: "Night Drive",
    subtitle: "City lights. No destination.",
    query: "night drive playlist dark synth r&b",
    colors: ["#a66cff", "#45247b", "#160c2d"],
    icon: "◒",
  },
  {
    id: "gym",
    title: "Locked In",
    subtitle: "Energy for one more rep.",
    query: "gym workout hype playlist",
    colors: ["#ff6347", "#a91d20", "#3c080d"],
    icon: "⚡",
  },
  {
    id: "soft",
    title: "Soft Hours",
    subtitle: "Slow songs. Quiet mind.",
    query: "soft chill acoustic playlist",
    colors: ["#ff9dbb", "#9b466d", "#351428"],
    icon: "♡",
  },
  {
    id: "party",
    title: "Main Character",
    subtitle: "Walk in like the night is yours.",
    query: "party club hits playlist 2026",
    colors: ["#ffe45e", "#d06c00", "#562400"],
    icon: "★",
  },
  {
    id: "focus",
    title: "Deep Focus",
    subtitle: "No noise. Just progress.",
    query: "deep focus lofi study playlist",
    colors: ["#63e6be", "#147d70", "#063831"],
    icon: "◎",
  },
];

function playlistHref(query) {
  return `/search/${encodeURIComponent(query)}`;
}

export default function BrowseAll() {
  return (
    <main className="page mx-auto w-full max-w-[1500px] text-gray-200">
      <header className="mb-7 pt-1 sm:mb-9">
        <p className="eyebrow mb-2">DISCOVER YOUR NEXT SOUND</p>
        <h1 className="browse-all-title">Browse all</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted sm:text-base">
          Skip the genre boxes. Start with what is hot, or pick the mood that matches your moment.
        </p>
      </header>

      <section aria-labelledby="hot-now-title">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Updated for right now</p>
            <h2 id="hot-now-title" className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Hot playlists
            </h2>
          </div>
          <span className="hidden text-sm text-muted sm:block">Tap a mix and discover what is moving</span>
        </div>

        <div className="no-scrollbar -mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-3">
          {HOT_PLAYLISTS.map((playlist, index) => (
            <Link
              key={playlist.id}
              href={playlistHref(playlist.query)}
              className="group relative min-h-[250px] w-[78vw] max-w-[310px] shrink-0 snap-start overflow-hidden rounded-card border border-white/10 p-5 shadow-lg transition duration-300 hover:-translate-y-1 hover:border-white/25 hover:shadow-2xl focus-visible:outline-accent sm:w-[270px]"
              style={{
                background: `linear-gradient(145deg, ${playlist.colors[0]} 0%, ${playlist.colors[1]} 50%, ${playlist.colors[2]} 100%)`,
              }}
              aria-label={`Open ${playlist.title} playlist search`}
            >
              <span className="absolute -right-6 -top-7 select-none text-[8rem] font-black leading-none text-white/15 transition duration-500 group-hover:rotate-6 group-hover:scale-110" aria-hidden="true">
                {playlist.art}
              </span>
              <span className="relative z-10 inline-flex rounded-full border border-white/20 bg-black/20 px-2.5 py-1 text-[10px] font-extrabold tracking-[0.16em] text-white backdrop-blur-sm">
                {playlist.eyebrow}
              </span>
              <div className="absolute inset-x-5 bottom-5 z-10">
                <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg text-navy opacity-0 shadow-xl transition duration-300 group-hover:translate-y-0 group-hover:opacity-100 sm:translate-y-2" aria-hidden="true">
                  ▶
                </span>
                <h3 className="text-2xl font-black tracking-tight text-white">{playlist.title}</h3>
                <p className="mt-1 text-sm leading-snug text-white/80">{playlist.description}</p>
              </div>
              <span className="absolute bottom-0 left-0 h-1 w-0 bg-white/80 transition-all duration-500 group-hover:w-full" aria-hidden="true" />
              <span className="sr-only">Playlist {index + 1} of {HOT_PLAYLISTS.length}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-10 pb-10" aria-labelledby="vibe-title">
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">No labels, just a feeling</p>
          <h2 id="vibe-title" className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Pick your vibe
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {VIBE_PLAYLISTS.map((vibe) => (
            <Link
              key={vibe.id}
              href={playlistHref(vibe.query)}
              className="group relative flex min-h-[132px] items-end overflow-hidden rounded-card border border-white/10 p-5 shadow-lg transition duration-300 hover:-translate-y-0.5 hover:border-white/25 focus-visible:outline-accent"
              style={{
                background: `linear-gradient(120deg, ${vibe.colors[2]} 0%, ${vibe.colors[1]} 58%, ${vibe.colors[0]} 145%)`,
              }}
              aria-label={`Open ${vibe.title} playlist search`}
            >
              <span className="absolute right-4 top-1/2 -translate-y-1/2 select-none text-6xl font-black text-white/20 transition duration-300 group-hover:rotate-6 group-hover:scale-110" aria-hidden="true">
                {vibe.icon}
              </span>
              <div className="relative z-10 pr-16">
                <h3 className="text-xl font-extrabold text-white">{vibe.title}</h3>
                <p className="mt-1 text-sm text-white/70">{vibe.subtitle}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
