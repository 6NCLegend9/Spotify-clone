import { PlaylistHeroSkeleton, SongRowsSkeleton } from "@/components/Skeleton";

export default function loading() {
  return (
    <div className="page">
      <PlaylistHeroSkeleton />
      <SongRowsSkeleton />
    </div>
  );
}
