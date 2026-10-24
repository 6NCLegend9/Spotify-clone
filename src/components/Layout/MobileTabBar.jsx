"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House as GoHome,
  House as GoHomeFill,
  LibraryBig,
  Plus,
  Search,
} from "lucide-react";

export default function MobileTabBar({ hidden = false }) {
  const pathname = usePathname();

  const homeActive = pathname === "/";
  const searchActive = pathname.startsWith("/search");
  const libraryActive = pathname.startsWith("/library") || pathname.startsWith("/following") || pathname.startsWith("/recently-played");

  return (
    <nav
      className={`app-tabbar phone-only-flex${hidden ? " is-hidden" : ""}`}
      aria-label="Primary"
      hidden={hidden}
      inert={hidden ? "" : undefined}
      aria-hidden={hidden || undefined}
    >
      <Link
        href="/"
        aria-current={homeActive ? "page" : undefined}
        className={`app-tab ${homeActive ? "is-active" : ""}`}
      >
        {homeActive ? <GoHomeFill fill="currentColor" aria-hidden="true" size={26} /> : <GoHome aria-hidden="true" size={26} />}
        <span>Home</span>
      </Link>
      <Link
        href="/search"
        aria-current={searchActive ? "page" : undefined}
        onClick={() => window.dispatchEvent(new Event("heykasa:open-search"))}
        className={`app-tab ${searchActive ? "is-active" : ""}`}
      >
        <Search aria-hidden="true" size={26} strokeWidth={searchActive ? 3 : 2} />
        <span>Search</span>
      </Link>
      <Link
        href="/library"
        aria-current={libraryActive ? "page" : undefined}
        className={`app-tab ${libraryActive ? "is-active" : ""}`}
      >
        <LibraryBig aria-hidden="true" size={26} strokeWidth={libraryActive ? 2.5 : 2} />
        <span>Your Library</span>
      </Link>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("heykasa:open-create"))}
        className="app-tab"
        aria-label="Create playlist or Jam"
      >
        <Plus aria-hidden="true" size={26} />
        <span>Create</span>
      </button>
    </nav>
  );
}
