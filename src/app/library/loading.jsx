import { CardGridSkeleton } from "@/components/Skeleton";

export default function loading() {
  return (
    <div className="page">
      <div className="mb-8 h-10 w-48 animate-shimmer rounded-md bg-white/[0.06]" />
      <CardGridSkeleton />
    </div>
  );
}
