import { navigate } from "../hooks/useHashRoute";

export function ArtistCard({ artist }) {
  return <article className="artist-card">
    <button className="artist-card-main" onClick={() => navigate(`/artist/${artist.id}`)}>
      <img src={artist.avatarUrl || "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&q=80"} alt={`${artist.name} portrait`} />
      <span><strong>{artist.name}</strong><small>{artist.genres.slice(0, 2).join(" / ") || "Artist"}</small></span>
    </button>
  </article>;
}