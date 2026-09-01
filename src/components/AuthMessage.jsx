"use client";

import Link from "next/link";

export default function AuthMessage({
  tone = "error",
  title,
  message,
  onRetry,
  retryLabel = "Try again",
  href,
  hrefLabel = "Request a new password link",
  id,
}) {
  if (!title && !message) return null;

  const isError = tone === "error";

  return (
    <div
      id={id}
      role={isError ? "alert" : "status"}
      aria-live="polite"
      className={`rounded-xl border px-4 py-3 text-left ${
        isError
          ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
          : "border-[#00e6e6]/25 bg-[#00e6e6]/10 text-[#d7fbff]"
      }`}
    >
      {title ? <p className="text-sm font-semibold">{title}</p> : null}
      {message ? (
        <p className={`text-sm leading-5 ${title ? "mt-1 text-white/80" : ""}`}>{message}</p>
      ) : null}
      {(onRetry || href) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {onRetry ? (
            <button type="button" onClick={onRetry} className="btn-ghost h-9 px-3 text-xs">
              {retryLabel}
            </button>
          ) : null}
          {href ? (
            <Link href={href} className="btn-primary h-9 px-3 text-xs">
              {hrefLabel}
            </Link>
          ) : null}
        </div>
      )}
    </div>
  );
}
