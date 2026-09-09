export default function loading() {
  return (
    <div className="page text-white">
      <div className="mb-6 h-10 w-40 animate-shimmer rounded-md bg-white/[0.06]" />
      <div className="mb-8 h-48 animate-shimmer rounded-xl bg-white/[0.04]" />
      <div className="mb-8 h-64 animate-shimmer rounded-xl bg-white/[0.04]" />
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="h-72 animate-shimmer rounded-xl bg-white/[0.04]" />
        <div className="h-72 animate-shimmer rounded-xl bg-white/[0.04]" />
      </div>
    </div>
  );
}
