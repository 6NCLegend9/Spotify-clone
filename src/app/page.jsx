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
      <section className="sr-only" aria-label="HayKasa music streaming">
        <h1>HayKasa Music - Free Music Streaming and Playlists</h1>
        <p>
          HayKasa is free, with no ads. Listen in one screen without an account.
          Save, follow, and Jam after you sign in.
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
