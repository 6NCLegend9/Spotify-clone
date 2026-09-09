export default function loading() {
  return (
    <div className="page text-white">
      <div className="mb-8 h-10 w-48 animate-shimmer rounded-md bg-white/[0.06]" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 12 }).map((_, index) => (
          <div key={index} className="min-w-0">
            <div className="aspect-square w-full animate-shimmer rounded-full bg-white/[0.06]" />
            <div className="mx-auto mt-3 h-3 w-2/3 animate-shimmer rounded bg-white/[0.06]" />
          </div>
        ))}
      </div>
    </div>
  );
}
