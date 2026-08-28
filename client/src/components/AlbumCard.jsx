import { navigate } from "../hooks/useHashRoute";

export function AlbumCard({ album }) {
  return <article className="album-card">
    <button className="album-card-main" onClick={() => navigate(`/album/${album.id}`)}>
      <img src={album.coverUrl || "https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?w=800&q=80"} alt={`${album.title} cover`} />
      <span><strong>{album.title}</strong><small>{album.artistName} {album.releaseYear ? `- ${album.releaseYear}` : ""}</small></span>
    </button>
  </article>;
}