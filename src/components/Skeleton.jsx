"use client";

export function ShimmerBlock({ className = "" }) {
  return <div className={`animate-shimmer rounded-md bg-white/[0.06] ${className}`} />;
}

export function CardGridSkeleton({ count = 8, aspect = "aspect-square" }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="min-w-0 overflow-hidden rounded-lg bg-white/[0.04] p-3">
          <ShimmerBlock className={`${aspect} w-full`} />
          <ShimmerBlock className="mt-4 h-4 w-3/4" />
          <ShimmerBlock className="mt-2 h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function SongRowsSkeleton({ count = 8 }) {
  return (
    <div className="mt-4 space-y-2">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-md px-2 py-2">
          <ShimmerBlock className="h-11 w-11 shrink-0" />
          <div className="min-w-0 flex-1">
            <ShimmerBlock className="h-4 w-2/3" />
            <ShimmerBlock className="mt-2 h-3 w-1/3" />
          </div>
          <ShimmerBlock className="h-3 w-10" />
        </div>
      ))}
    </div>
  );
}

export function PlaylistHeroSkeleton() {
  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
      <ShimmerBlock className="aspect-square w-40 shrink-0 sm:w-52 lg:w-60" />
      <div className="min-w-0 flex-1 pb-1">
        <ShimmerBlock className="h-3 w-28" />
        <ShimmerBlock className="mt-4 h-12 w-3/4 max-w-xl" />
        <ShimmerBlock className="mt-5 h-4 w-48" />
      </div>
    </div>
  );
}

export function HomeSectionSkeleton() {
  return (
    <div className="mb-10">
      <ShimmerBlock className="mb-4 h-7 w-40" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="overflow-hidden rounded-xl border border-white/8 bg-white/[0.04]">
            <ShimmerBlock className="aspect-video w-full" />
            <div className="p-4">
              <ShimmerBlock className="h-4 w-4/5" />
              <ShimmerBlock className="mt-2 h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
