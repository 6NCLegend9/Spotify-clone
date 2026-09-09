export default function loading() {
  return (
    <div className="page">
      <div className="mb-8 h-10 w-48 animate-shimmer rounded-md bg-white/[0.06]" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="aspect-square animate-shimmer rounded-xl bg-white/[0.06]" />
        ))}
      </div>
    </div>
  );
}
