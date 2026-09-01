import HomeClient from "./HomeClient";

const featuredSearches = [
  "English songs",
  "Trending songs",
  "New releases",
];

export default function Home() {
  return (
    <div>
      <section className="sr-only" aria-label="HeyKasa music streaming">
        <h1>HeyKasa Music - Free Music Streaming and MP3 Download</h1>
        <p>
          HeyKasa is a free music streaming app for English songs.
          Listen online, download MP3 tracks, create
          playlists, save favourites, explore albums, and discover artists in a
          fast web music player.
        </p>
        <ul>
          {featuredSearches.map((search) => (
            <li key={search}>{search}</li>
          ))}
        </ul>
      </section>
      <HomeClient />
    </div>
  );
}
