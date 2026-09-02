"use client";

import Link from "next/link";

const TONES = {
  error: "border-amber-400/30 bg-amber-400/10 text-amber-100",
  warning: "border-yellow-300/25 bg-yellow-300/10 text-yellow-50",
  success: "border-[#00e6e6]/25 bg-[#00e6e6]/10 text-[#d7fbff]",
  info: "border-sky-300/25 bg-sky-300/10 text-sky-50",
};

export default function UserMessage({
  tone = "error",
  title,
  message,
  onRetry,
  retryLabel = "Try again",
  href,
  hrefLabel = "Continue",
  id,
  compact = false,
  busy = false,
}) {
  if (!title && !message) return null;

  const isError = tone === "error";

  return (
    <div
      id={id}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      aria-atomic="true"
      className={`rounded-xl border text-left ${compact ? "px-3 py-2" : "px-4 py-3"} ${
        TONES[tone] || TONES.info
      }`}
    >
      {title ? <p className="text-sm font-semibold">{title}</p> : null}
      {message ? (
        <p className={`text-sm leading-5 ${title ? "mt-1 text-white/80" : ""}`}>{message}</p>
      ) : null}
      {(onRetry || href) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              disabled={busy}
              className="btn-ghost h-9 px-3 text-xs disabled:cursor-wait disabled:opacity-60"
            >
              {busy ? "Trying again…" : retryLabel}
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
