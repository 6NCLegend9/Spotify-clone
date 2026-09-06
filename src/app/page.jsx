import { redirect } from "next/navigation";
import { resolveParams } from "@/utils/routeParams";
import HomeClient from "./HomeClient";

const featuredSearches = [
  "English songs",
  "Trending songs",
  "New releases",
];

export default async function Home({ searchParams }) {
  const params = await resolveParams(searchParams);
  if (params?.error) {
    redirect(`/login?error=${encodeURIComponent(String(params.error))}`);
  }

  return (
    <div>
      <section className="sr-only" aria-label="HeyKasa music streaming">
        <h1>HeyKasa Music - Free Music Streaming and Playlists</h1>
        <p>
          HeyKasa is a free music streaming app for English songs.
          Listen online, create playlists, save favourites, explore albums,
          and discover artists in a fast web music player.
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
