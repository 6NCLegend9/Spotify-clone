import { PlaylistHeroSkeleton, SongRowsSkeleton } from "@/components/Skeleton";

export default function loading() {
  return (
    <main className="px-[3vw] py-8 text-white">
      <PlaylistHeroSkeleton />
      <SongRowsSkeleton />
    </main>
  );
}
