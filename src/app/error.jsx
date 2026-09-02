"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorPage({ error, reset }) {
  useEffect(() => {
    console.error("Route render failed:", error?.digest || error?.message || "Unknown error");
  }, [error]);

  return (
    <div className="page grid min-h-full place-items-center text-center text-white">
      <div className="animate-fade-in">
        <p className="eyebrow">Something went wrong</p>
        <h1 className="mt-3 text-3xl font-bold">This page couldn’t load</h1>
        <p className="mt-2 text-sm text-[#9aa8b5]">
          Your account and music are safe. Try loading the page again, or head back home.
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
