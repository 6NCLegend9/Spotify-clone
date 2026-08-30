"use client";
import YouTubeMusicResults from "@/components/YouTubeMusicResults";
import { useParams } from "next/navigation";

const SearchPage = () => {
  const params = useParams();
  const query = decodeURIComponent(params?.query || "");

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
