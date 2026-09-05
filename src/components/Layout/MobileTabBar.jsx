"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FiDisc, FiHome, FiSearch } from "react-icons/fi";

export default function MobileTabBar() {
  const pathname = usePathname();

  const homeActive = pathname === "/";
  const searchActive = pathname.startsWith("/search");
  const libraryActive = pathname.startsWith("/library");

  const openSearch = () => {
    window.dispatchEvent(new Event("heykasa:open-search"));
  };

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
      <button
        type="button"
        onClick={openSearch}
        aria-current={searchActive ? "page" : undefined}
        className={`app-tab ${searchActive ? "is-active" : ""}`}
      >
        <FiSearch aria-hidden="true" className="text-xl" />
        <span>Search</span>
      </button>
      <Link
        href="/library"
        aria-current={libraryActive ? "page" : undefined}
        className={`app-tab ${libraryActive ? "is-active" : ""}`}
      >
        <FiDisc aria-hidden="true" className="text-xl" />
        <span>Library</span>
      </Link>
    </nav>
  );
}
