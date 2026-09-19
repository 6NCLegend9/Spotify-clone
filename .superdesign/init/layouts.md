# Shared layout components

All live inside Next.js root layout `src/app/layout.js` via `AppShell`.

## AppShell — `src/components/Layout/AppShell.jsx`
Grid shell: sidebar, overlay, stage (GhostFibers, atmosphere, navbar, content, footer), player slot, mobile tab bar, create hub.

```jsx
"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSelector } from "react-redux";
import { Toaster } from "react-hot-toast";
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar/Sidebar";
import MobileTabBar from "@/components/Layout/MobileTabBar";
import CreateHub from "@/components/Layout/CreateHub";
import Atmosphere from "@/components/Layout/Atmosphere";
import PageTransit from "@/components/Layout/PageTransit";
import ErrorBoundary from "@/components/ErrorBoundary";
import OnlineStatus from "@/components/Homepage/OnlineStatus";
import PullToRefresh from "@/components/PullToRefresh";
import { JamProvider } from "@/components/Jam/JamProvider";
import useNetworkRecovery from "@/hooks/useNetworkRecovery";
import useScrollPerformance from "@/hooks/useScrollPerformance";
import usePointerTilt from "@/hooks/usePointerTilt";
import PlaybackPersistence from "@/components/PlaybackPersistence";

const MusicPlayer = dynamic(
  () => import("@/components/MusicPlayer"),
  { ssr: false, loading: () => <div role="status" aria-label="Loading player" className="h-20 w-full animate-pulse bg-white/5 motion-reduce:animate-none" /> },
);

const GhostFibers = dynamic(
  () => import("@/components/ReactBits/GhostFibers"),
  { ssr: false },
);

const JamController = dynamic(
  () => import("@/components/Jam/JamController"),
  { ssr: false },
);

export default function AppShell({ children }) {
  const hasTrack = useSelector((state) => Boolean(state.player.youtubeVideo?.id || state.player.activeSong?.id));
  const pathname = usePathname();
  const [showNav, setShowNav] = useState(false);
  const [isCompactNav, setIsCompactNav] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const navModal = showNav && isCompactNav;

  return (
    <div className={`app-shell${collapsed ? " is-sidebar-collapsed" : ""}`} data-route={pathname === "/" ? "home" : "app"}>
      <Sidebar />
      <button type="button" aria-label="Close navigation" className={`app-overlay md:hidden ${showNav ? "is-open" : ""}`} />
      <div className="app-stage" inert={navModal}>
        <GhostFibers className="app-ghost-fibers" lineColor="#0a5c66" glowColor="#00e6e6" backdropColor="#000814" />
        <div className="app-ghost-fibers-shade" aria-hidden="true" />
        <Atmosphere />
        <Navbar />
        <div className="app-content" id="main-content" tabIndex={-1}>
          <PullToRefresh />
          <OnlineStatus />
          <PageTransit pathname={pathname}>{children}</PageTransit>
          {pathname?.startsWith("/arcade") ? null : (
            <footer className="app-footer">
              <div className="flex justify-center gap-4">
                <Link href="/terms" className="transition hover:text-white">Terms of Service</Link>
                <Link href="/privacy" className="transition hover:text-white">Privacy Policy</Link>
                <Link href="/accessibility" className="transition hover:text-white">Accessibility</Link>
              </div>
              <p className="mt-4">&copy; {new Date().getFullYear()} HayKasa Music. All rights reserved.</p>
            </footer>
          )}
        </div>
        <JamController />
      </div>
      <div className="app-player" id="player" tabIndex={-1}>
        {hasTrack && <MusicPlayer />}
      </div>
      <MobileTabBar />
      <CreateHub />
    </div>
  );
}
```

## Navbar — `src/components/Navbar.jsx`

```jsx
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GoHome, GoHomeFill } from "react-icons/go";
import { MdOutlineMenu, MdRefresh, MdSportsEsports } from "react-icons/md";
import BrandMark from "./Layout/BrandMark";
import { useNav } from "./Layout/AppShell";
import Searchbar from "./Searchbar";
import UpdatesBell from "./UpdatesBell";
import { canUseArcade } from "@/utils/arcadeAccess";

const Navbar = () => {
  const { setShowNav, navModal } = useNav();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [imageFailed, setImageFailed] = useState(false);
  const homeActive = pathname === "/";
  const userName =
    typeof session?.user?.name === "string" && session.user.name.trim()
      ? session.user.name.trim()
      : "Account";
  const rawImageUrl = session?.user?.image || session?.user?.imageUrl;
  const imageUrl = typeof rawImageUrl === "string" ? rawImageUrl : "";

  return (
    <header className="app-navbar">
      <div className="navbar-slot navbar-slot-start">
        <button type="button" onClick={() => setShowNav(true)} className="icon-btn h-11 w-11 shrink-0 md:hidden" aria-label="Open menu" aria-expanded={navModal} aria-controls="app-sidebar">
          <MdOutlineMenu aria-hidden="true" className="text-xl" />
        </button>
        <BrandMark compact className="hidden shrink-0 sm:flex md:hidden" />
      </div>
      <div className="navbar-search-cluster">
        <Link href="/" aria-label="Home" className={`nav-home-btn ${homeActive ? "is-active" : ""}`}>
          {homeActive ? <GoHomeFill aria-hidden="true" /> : <GoHome aria-hidden="true" />}
        </Link>
        <Searchbar />
      </div>
      <div className="navbar-slot navbar-slot-end">
        <button type="button" className="icon-btn navbar-refresh h-11 w-11 shrink-0" aria-label="Refresh">
          <MdRefresh aria-hidden="true" className="text-xl" />
        </button>
        <Link href="/arcade" className={`icon-btn h-11 w-11 shrink-0 ${canUseArcade(session?.user?.email) ? "" : "hidden"}`} aria-label="Open Beat Arcade">
          <MdSportsEsports aria-hidden="true" className="text-xl" />
        </Link>
        <UpdatesBell />
        {status === "authenticated" ? (
          <Link href="/settings" aria-label={`Open settings for ${userName}`} className="grid h-11 w-11 place-items-center overflow-hidden rounded-full ring-1 ring-white/20 shadow-glow transition hover:ring-[#00e6e6]">
            {imageUrl && !imageFailed ? (
              <img src={imageUrl} alt="" onError={() => setImageFailed(true)} className="h-full w-full object-cover" />
            ) : (
              <span aria-hidden="true" className="grid h-full w-full place-items-center bg-[#00e6e6] text-xs font-semibold text-black">{userName.charAt(0).toUpperCase()}</span>
            )}
          </Link>
        ) : status === "unauthenticated" ? (
          <Link href="/login" className="btn-primary h-8 px-2.5 text-xs sm:h-10 sm:px-4 sm:text-sm">Log in</Link>
        ) : (
          <span className="h-8 w-8 animate-pulse rounded-full bg-white/10 sm:h-10 sm:w-10" role="status" aria-label="Loading account" />
        )}
      </div>
    </header>
  );
};

export default Navbar;
```

## Sidebar — `src/components/Sidebar/Sidebar.jsx`

```jsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FaGithub } from "react-icons/fa";
import { FiChevronLeft, FiChevronRight, FiDisc, FiFileText, FiHeart, FiHome, FiInfo, FiSettings, FiShield, FiUsers } from "react-icons/fi";
import { IoClose } from "react-icons/io5";
import BrandMark from "../Layout/BrandMark";

const links = [
  ["Home", "/", FiHome],
  ["Your Library", "/library", FiDisc],
  ["Liked Songs", "/library/liked", FiHeart],
  ["Following", "/following", FiUsers],
  ["Settings", "/settings", FiSettings],
  ["Terms of Service", "/terms", FiFileText],
  ["Privacy Policy", "/privacy", FiShield],
  ["Accessibility", "/accessibility", FiInfo],
];

export default function Sidebar() {
  const pathname = usePathname();
  const isActive = (href) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <aside id="app-sidebar" className="app-sidebar" aria-label="Main menu">
      <div className="sidebar-head">
        <div className="sidebar-brand">
          <BrandMark />
          <div className="sidebar-head-actions">
            <button type="button" className="sidebar-toggle icon-btn hidden md:inline-flex" aria-label="Collapse sidebar"><FiChevronLeft /></button>
            <button type="button" className="sidebar-toggle icon-btn md:hidden" aria-label="Close menu"><IoClose className="text-xl" /></button>
          </div>
        </div>
      </div>
      <nav aria-label="Primary" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-4">
        {links.map(([label, href, Icon]) => (
          <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined} className={`nav-link ${isActive(href) ? "is-active" : ""}`}>
            <Icon aria-hidden="true" className="text-lg shrink-0" />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
      <div className="border-t border-white/10 px-4 py-4">
        <a href="https://github.com/6NCLegend9" className="inline-flex items-center gap-2 text-sm text-[#9aa8b5] hover:text-[#00e6e6]"><FaGithub /> GitHub</a>
      </div>
    </aside>
  );
}
```

## MobileTabBar — `src/components/Layout/MobileTabBar.jsx`

```jsx
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
      <Link href="/" aria-current={homeActive ? "page" : undefined} className={`app-tab ${homeActive ? "is-active" : ""}`}>
        <FiHome aria-hidden="true" className="text-xl" /><span>Home</span>
      </Link>
      <Link href="/search" aria-current={searchActive ? "page" : undefined} className={`app-tab ${searchActive ? "is-active" : ""}`}>
        <FiSearch aria-hidden="true" className="text-xl" /><span>Search</span>
      </Link>
      <Link href="/library" aria-current={libraryActive ? "page" : undefined} className={`app-tab ${libraryActive ? "is-active" : ""}`}>
        <FiDisc aria-hidden="true" className="text-xl" /><span>Your Library</span>
      </Link>
      <button type="button" className="app-tab" aria-label="Create playlist">
        <FiPlus aria-hidden="true" className="text-xl" /><span>Create</span>
      </button>
    </nav>
  );
}
```

## BrandMark — `src/components/Layout/BrandMark.jsx`

```jsx
import Image from "next/image";
import Link from "next/link";
import banner from "@/assets/HayKasa-banner-removebg.png";
import logo from "@/assets/HayKasa-logo-removebg.png";
import { SITE_NAME } from "@/utils/siteConfig";

export default function BrandMark({ onClick, className = "", compact = false }) {
  return (
    <Link href="/" onClick={onClick} className={`brand-mark ${compact ? "is-compact" : ""} ${className}`.trim()}>
      <Image src={compact ? logo : banner} alt={SITE_NAME} priority className="brand-mark-lockup" />
    </Link>
  );
}
```
