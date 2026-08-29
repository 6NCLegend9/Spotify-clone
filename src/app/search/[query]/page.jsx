"use client";
import YouTubeMusicResults from "@/components/YouTubeMusicResults";

const page = ({ params }) => {
  const query = decodeURIComponent(params.query || "");

  return (
    <div className="mx-auto mt-16 w-11/12 text-gray-200">
      <h1 className="mt-10 text-3xl font-bold">
        YouTube results for "{query}"
      </h1>
      <YouTubeMusicResults query={query} />
    </div>
  );
};

export default page;
