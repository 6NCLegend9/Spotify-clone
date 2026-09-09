export default function loading() {
  return (
    <div className="page">
      <div className="browse-all-title h-8 w-48 animate-shimmer rounded-md bg-white/[0.06] text-transparent">
        Browse all
      </div>
      <div className="browse-grid">
        {Array.from({ length: 10 }).map((_, index) => (
          <div key={index} className="aspect-square animate-shimmer rounded-xl bg-white/[0.06]" />
        ))}
      </div>
    </div>
  );
}
