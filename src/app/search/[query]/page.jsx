"use client";
import YouTubeMusicResults from "@/components/YouTubeMusicResults";
import EmptyState from "@/components/EmptyState";
import { useParams } from "next/navigation";

function readQuery(value) {
  const encoded = Array.isArray(value) ? value[0] : value;
  if (typeof encoded !== "string") return { query: "", invalid: false };
  if (!/%[0-9a-f]{2}/i.test(encoded)) {
    return { query: encoded.trim(), invalid: false };
  }

  try {
    return { query: decodeURIComponent(encoded).trim(), invalid: false };
  } catch {
    return { query: "", invalid: true };
  }
}

const SearchPage = () => {
  const params = useParams();
  const { query, invalid } = readQuery(params?.query);

  if (invalid || !query) {
    return (
      <div className="page text-gray-200">
        <EmptyState
          eyebrow="Search"
          title={invalid ? "This search link is invalid" : "Enter something to search"}
          message={
            invalid
              ? "The search address is malformed. Start a new search from Home."
              : "Search for a song, artist, playlist, or genre."
          }
          href="/"
          actionLabel="Back to Home"
        />
      </div>
    );
  }

  return (
    <div className="page text-gray-200">
      <p className="eyebrow">Search</p>
      <h1 className="mt-2 text-3xl font-bold text-white">
        Results for &quot;{query}&quot;
      </h1>
      <YouTubeMusicResults query={query} />
    </div>
  );
};

export default SearchPage;
