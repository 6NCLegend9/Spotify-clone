"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { FiChevronLeft, FiChevronRight, FiHeart, FiHome, FiSearch, FiSettings, FiUsers } from "react-icons/fi";
import { MdLibraryMusic, MdSportsEsports } from "react-icons/md";
import { canUseArcade } from "@/utils/arcadeAccess";
import { IoClose } from "react-icons/io5";
import BrandMark from "../Layout/BrandMark";
import { useNav } from "../Layout/AppShell";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import Profile from "./Profile";
import Languages from "./Languages";
import Playlists from "./Playlists";

const Sidebar = () => {
  const { showNav, setShowNav, navModal, collapsed, toggleCollapsed } = useNav();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const sidebarRef = useRef(null);

  useFocusTrap({
    enabled: Boolean(navModal),
    onClose: () => setShowNav(false),
    containerRef: sidebarRef,
  });

  const close = () => setShowNav(false);
  const go = () => close();
  const isActive = (href) => href === "/" ? pathname === "/" : pathname.startsWith(href);

  const libraryLinks = [
    ["Liked Songs", "/library/liked", FiHeart],
    ["Following", "/following", FiUsers],
    ...(canUseArcade(session?.user?.email) ? [["Beat Arcade", "/arcade", MdSportsEsports]] : []),
  ];

  return (
    <aside
      ref={sidebarRef}
      id="app-sidebar"
      className={`app-sidebar ${showNav ? "is-open" : ""} ${collapsed ? "is-collapsed" : ""}`}
      aria-label="Main menu"
      {...(navModal ? { role: "dialog", "aria-modal": true } : {})}
    >
      <div className="spotify-sidebar-top">
        <div className="sidebar-head">
          <div className="sidebar-brand">
            <BrandMark onClick={go} compact={collapsed} />
            <div className="sidebar-head-actions">
              <button
                type="button"
                onClick={toggleCollapsed}
                className="sidebar-toggle icon-btn hidden md:inline-flex items-center justify-center"
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {collapsed ? <FiChevronRight aria-hidden="true" /> : <FiChevronLeft aria-hidden="true" />}
              </button>
              <button
                type="button"
                onClick={close}
                className="sidebar-toggle icon-btn md:hidden"
                aria-label="Close menu"
              >
                <IoClose aria-hidden="true" className="text-xl" />
              </button>
            </div>
          </div>
        </div>

        <nav aria-label="Primary" className={`spotify-primary-nav ${collapsed ? "px-1.5" : "px-3"}`}>
          <Link href="/" onClick={go} title={collapsed ? "Home" : undefined} aria-current={isActive("/") ? "page" : undefined} className={`nav-link ${isActive("/") ? "is-active" : ""}`}>
            <FiHome aria-hidden="true" className="text-xl shrink-0" />
            <span className={collapsed ? "md:hidden" : ""}>Home</span>
          </Link>
          <Link href="/search" onClick={go} title={collapsed ? "Search" : undefined} aria-current={isActive("/search") ? "page" : undefined} className={`nav-link ${isActive("/search") ? "is-active" : ""}`}>
            <FiSearch aria-hidden="true" className="text-xl shrink-0" />
            <span className={collapsed ? "md:hidden" : ""}>Search</span>
          </Link>
        </nav>
      </div>

      <div className={`spotify-library-panel ${collapsed ? "is-compact" : ""}`}>
        <div className={`spotify-library-head ${collapsed ? "justify-center" : ""}`}>
          <Link href="/library" onClick={go} className={`spotify-library-title ${isActive("/library") ? "is-active" : ""}`} title="Your Library">
            <MdLibraryMusic aria-hidden="true" className="text-xl shrink-0" />
            <span className={collapsed ? "md:hidden" : ""}>Your Library</span>
          </Link>
        </div>

        <div className={`spotify-library-filters ${collapsed ? "md:hidden" : ""}`} aria-label="Library filters">
          <Link href="/library" className="spotify-filter-pill">Playlists</Link>
          <Link href="/following" className="spotify-filter-pill">Artists</Link>
          <Link href="/library" className="spotify-filter-pill">Albums</Link>
        </div>

        <div className={`px-3 pb-2 ${collapsed ? "md:hidden" : ""}`}>
          <Profile />
        </div>

        <nav aria-label="Library shortcuts" className={`flex min-h-0 flex-col gap-1 overflow-y-auto ${collapsed ? "px-1.5" : "px-3"}`}>
          {libraryLinks.map(([label, href, Icon]) => (
            <Link key={href} href={href} onClick={go} title={collapsed ? label : undefined} aria-current={isActive(href) ? "page" : undefined} className={`nav-link ${isActive(href) ? "is-active" : ""}`}>
              <Icon aria-hidden="true" className="text-lg shrink-0" />
              <span className={collapsed ? "md:hidden" : ""}>{label}</span>
            </Link>
          ))}

          <div className={collapsed ? "md:hidden" : ""}>
            <Playlists />
          </div>

          {status === "unauthenticated" && (
            <Link href="/signup" onClick={go} className={`nav-link ${collapsed ? "md:hidden" : ""}`}>
              Create account
            </Link>
          )}

          <div className={`mt-auto border-t border-white/10 pt-2 ${collapsed ? "md:hidden" : ""}`}>
            <Link href="/settings" onClick={go} className={`nav-link ${isActive("/settings") ? "is-active" : ""}`}>
              <FiSettings aria-hidden="true" className="text-lg shrink-0" />
              <span>Settings</span>
            </Link>
            <div className="pt-2"><Languages /></div>
          </div>
        </nav>
      </div>
    </aside>
  );
};

export default Sidebar;
