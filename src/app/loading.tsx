export default function Loading() {
  return <section role="status" aria-label="Loading music" className="min-h-[60vh] px-4 py-8 sm:px-8">
    <div aria-hidden="true" className="animate-pulse motion-reduce:animate-none">
      <div className="mb-8 h-8 w-48 rounded bg-white/10" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 10 }, (_, index) => <div key={index}>
          <div className="aspect-square rounded-lg bg-white/10" />
          <div className="mt-3 h-4 w-3/4 rounded bg-white/10" />
          <div className="mt-2 h-3 w-1/2 rounded bg-white/5" />
        </div>)}
      </div>
    </div>
  </section>;
}