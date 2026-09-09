import Link from "next/link";
import { GENRE_CATALOG } from "@/utils/genres";

const TILE_COLORS = [
  "#1e3264",
  "#e13300",
  "#8d67ab",
  "#e8115b",
  "#148a08",
  "#b02897",
  "#0d73ec",
  "#8c1932",
  "#ba5d07",
  "#503750",
  "#006450",
  "#af2896",
  "#e91429",
  "#1e3264",
  "#477d95",
  "#2d46b9",
  "#e1118c",
  "#dc148c",
  "#7d4b32",
  "#0a5c66",
  "#22a6b3",
  "#503750",
  "#148a08",
];

export default function BrowseAll() {
  return (
    <div className="page text-gray-200">
      <h1 className="browse-all-title">Browse all</h1>
      <div className="browse-grid">
        {GENRE_CATALOG.map((genre, index) => (
          <Link
            key={genre.id}
            href={`/search/${encodeURIComponent(genre.name)}`}
            className="browse-tile"
            style={{ backgroundColor: TILE_COLORS[index % TILE_COLORS.length] }}
          >
            <span className="browse-tile-title">{genre.name}</span>
            <span className="browse-tile-art" aria-hidden="true">
              {genre.name.charAt(0)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
