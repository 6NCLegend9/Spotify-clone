"use client";

import { humanizeError } from "@/utils/authErrors";
import Link from "next/link";

export default function ErrorPage({ reset }) {
  const details = humanizeError(null);

  return (
    <div className="page grid min-h-full place-items-center text-center text-white">
      <div className="animate-fade-in">
        <p className="eyebrow">Something went wrong</p>
        <h1 className="mt-3 text-3xl font-bold">{details.title}</h1>
        <p className="mt-2 text-sm text-[#9aa8b5]">
          The page failed to load. Try again, or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => reset?.()} className="btn-primary">
            Try again
          </button>
          <Link href="/" className="btn-ghost">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
