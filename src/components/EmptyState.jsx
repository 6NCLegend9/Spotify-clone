import Link from "next/link";

export default function EmptyState({
  eyebrow,
  title,
  message,
  actionLabel,
  onAction,
  href,
  secondaryHref,
  secondaryLabel = "Back to Home",
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-5 py-10 text-center text-white sm:px-8">
      {eyebrow ? <p className="eyebrow mb-3">{eyebrow}</p> : null}
      <h2 className="text-xl font-bold sm:text-2xl">{title}</h2>
      {message ? <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#9aa8b5]">{message}</p> : null}
      {(onAction || href || secondaryHref) ? (
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {onAction ? (
            <button type="button" onClick={onAction} className="btn-primary">
              {actionLabel || "Try again"}
            </button>
          ) : null}
          {href ? (
            <Link href={href} className="btn-primary">
              {actionLabel || "Continue"}
            </Link>
          ) : null}
          {secondaryHref ? (
            <Link href={secondaryHref} className="btn-ghost">
              {secondaryLabel}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
