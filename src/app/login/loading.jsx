export default function loading() {
  return (
    <div className="page grid min-h-full place-items-center">
      <div className="auth-card w-full max-w-md animate-pulse bg-white/[0.02]">
        <div className="h-3 w-24 rounded bg-white/10" />
        <div className="mt-4 h-8 w-32 rounded bg-white/10" />
        <div className="mt-6 h-12 rounded-xl bg-white/10" />
        <div className="mt-3 h-12 rounded-xl bg-white/10" />
        <div className="mt-5 h-11 rounded-full bg-white/10" />
      </div>
    </div>
  );
}
