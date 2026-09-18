"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function OpenDesktopPage() {
  useEffect(() => {
    window.location.replace("heykasa://open");
  }, []);

  return (
    <main className="grid min-h-screen place-items-center bg-[#07111f] px-6 text-center text-white">
      <div className="max-w-md">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#00e6e6]">HeyKasa Desktop</p>
        <h1 className="mt-3 text-3xl font-semibold">Opening the desktop app</h1>
        <p className="mt-3 text-sm leading-6 text-[#9aa8b5]">
          If HeyKasa Desktop is installed, it should come to the front. Continue in the browser if it does not.
        </p>
        <Link href="/" className="btn-primary mt-6 inline-flex min-h-11 items-center px-5">
          Listen on the web
        </Link>
      </div>
    </main>
  );
}
