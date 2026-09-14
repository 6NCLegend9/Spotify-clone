"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { GoHome, GoHomeFill } from "react-icons/go";
import { FiChevronLeft, FiChevronRight, FiSettings } from "react-icons/fi";
import { MdOutlineMenu, MdSportsEsports } from "react-icons/md";
import BrandMark from "./Layout/BrandMark";
import { useNav } from "./Layout/AppShell";
import Searchbar from "./Searchbar";
import UpdatesBell from "./UpdatesBell";
import { canUseArcade } from "@/utils/arcadeAccess";

const Navbar = () => {
  const { setShowNav, navModal } = useNav();
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [imageFailed, setImageFailed] = useState(false);
  const [mobileFilter, setMobileFilter] = useState("All");
  const homeActive = pathname === "/";
  const userName = typeof session?.user?.name === "string" && session.user.name.trim() ? session.user.name.trim() : "Account";
  const rawImageUrl = session?.user?.image || session?.user?.imageUrl;
  const imageUrl = typeof rawImageUrl === "string" ? rawImageUrl : "";

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  return (
    <header className="app-navbar">
      <div className="navbar-slot navbar-slot-start">
        <button type="button" onClick={() => setShowNav(true)} className="icon-btn h-11 w-11 shrink-0 md:hidden" aria-label="Open menu" aria-expanded={navModal} aria-controls="app-sidebar">
          <MdOutlineMenu aria-hidden="true" className="text-xl" />
        </button>

        <BrandMark compact className="hidden shrink-0 sm:flex md:hidden" />

        <div className="hidden items-center gap-2 md:flex" aria-label="Navigation history">
          <button type="button" onClick={() => router.back()} className="icon-btn h-9 w-9" aria-label="Go back" title="Go back">
            <FiChevronLeft aria-hidden="true" className="text-xl" />
          </button>
          <button type="button" onClick={() => router.forward()} className="icon-btn h-9 w-9" aria-label="Go forward" title="Go forward">
            <FiChevronRight aria-hidden="true" className="text-xl" />
          </button>
        </div>
      </div>

      <div className="navbar-search-cluster">
        <Link href="/" aria-label="Home" title="Home" aria-current={homeActive ? "page" : undefined} className={`nav-home-btn ${homeActive ? "is-active" : ""}`}>
          {homeActive ? <GoHomeFill aria-hidden="true" /> : <GoHome aria-hidden="true" />}
        </Link>
        <Searchbar />
      </div>

      <div className="mobile-category-pills md:hidden" aria-label="Content filters">
        {["All", "Music", "Podcasts"].map((filter) => (
          <button key={filter} type="button" onClick={() => setMobileFilter(filter)} aria-pressed={mobileFilter === filter} className={`mobile-category-pill ${mobileFilter === filter ? "is-active" : ""}`}>
            {filter}
          </button>
        ))}
      </div>

      <div className="navbar-slot navbar-slot-end">
        <Link href="/arcade" className={`icon-btn h-11 w-11 shrink-0 ${canUseArcade(session?.user?.email) ? "" : "hidden"}`} aria-label="Open Beat Arcade" title="Beat Arcade">
          <MdSportsEsports aria-hidden="true" className="text-xl" />
        </Link>
        <UpdatesBell />
        <Link href="/settings" className="icon-btn h-11 w-11 shrink-0 md:hidden" aria-label="Settings" title="Settings">
          <FiSettings aria-hidden="true" className="text-xl" />
        </Link>
        {status === "authenticated" ? (
          <Link href="/settings" aria-label={`Open settings for ${userName}`} title="Open settings" className="grid h-11 w-11 place-items-center overflow-hidden rounded-full ring-1 ring-white/20 transition hover:ring-[var(--accent)]">
            {imageUrl && !imageFailed ? (
              <img src={imageUrl} alt="" onError={() => setImageFailed(true)} className="h-full w-full object-cover" />
            ) : (
              <span aria-hidden="true" className="grid h-full w-full place-items-center bg-[var(--accent)] text-xs font-semibold text-black sm:text-sm">
                {userName.charAt(0).toUpperCase()}
              </span>
            )}
          </Link>
        ) : status === "unauthenticated" ? (
          <Link href="/login" prefetch className="btn-primary h-8 px-2.5 text-xs sm:h-10 sm:px-4 sm:text-sm">Log in</Link>
        ) : (
          <span className="h-8 w-8 animate-pulse rounded-full bg-white/10 sm:h-10 sm:w-10" role="status" aria-label="Loading account" />
        )}
      </div>
    </header>
  );
};

export default Navbar;
