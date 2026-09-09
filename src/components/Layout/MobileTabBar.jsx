"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FiDisc, FiHome, FiPlus, FiSearch } from "react-icons/fi";

export default function MobileTabBar() {
  const pathname = usePathname();

  const homeActive = pathname === "/";
  const searchActive = pathname.startsWith("/search");
  const libraryActive = pathname.startsWith("/library");

  return (
    <nav className="app-tabbar md:hidden" aria-label="Primary">
      <Link
        href="/"
        aria-current={homeActive ? "page" : undefined}
        className={`app-tab ${homeActive ? "is-active" : ""}`}
      >
        <FiHome aria-hidden="true" className="text-xl" />
        <span>Home</span>
      </Link>
      <Link
        href="/search"
        aria-current={searchActive ? "page" : undefined}
        className={`app-tab ${searchActive ? "is-active" : ""}`}
      >
        <FiSearch aria-hidden="true" className="text-xl" />
        <span>Search</span>
      </Link>
      <Link
        href="/library"
        aria-current={libraryActive ? "page" : undefined}
        className={`app-tab ${libraryActive ? "is-active" : ""}`}
      >
        <FiDisc aria-hidden="true" className="text-xl" />
        <span>Your Library</span>
      </Link>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("heykasa:open-create"))}
        className="app-tab"
        aria-label="Create playlist"
      >
        <FiPlus aria-hidden="true" className="text-xl" />
        <span>Create</span>
      </button>
    </nav>
  );
}
