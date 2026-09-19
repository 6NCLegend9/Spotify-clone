"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error("Application render failed:", error?.digest || error?.message || "Unknown error");
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-[#000814] text-white">
        <main className="grid min-h-screen place-items-center px-5 text-center">
          <div className="max-w-lg">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#00e6e6]">HayKasa</p>
            <h1 className="mt-3 text-3xl font-bold">The app couldn’t start</h1>
            <p className="mt-3 text-sm leading-6 text-[#9aa8b5]">
              This is temporary. Try again, or refresh the page if the problem continues.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => reset()}
                className="rounded-full bg-[#00e6e6] px-5 py-3 font-bold text-[#001014]"
              >
                Try again
              </button>
              {/* global-error replaces the root layout, so Next.js Link is unavailable. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/"
                className="rounded-full border border-white/20 px-5 py-3 font-semibold text-white"
              >
                Reload Home
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
