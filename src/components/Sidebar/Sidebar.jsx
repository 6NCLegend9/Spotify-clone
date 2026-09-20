"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { FiChevronLeft, FiChevronRight, FiDisc, FiHeart, FiHome, FiSearch, FiSettings, FiUsers } from "react-icons/fi";
import { MdSportsEsports } from "react-icons/md";
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
  useFocusTrap({ enabled: Boolean(navModal), onClose: () => setShowNav(false), containerRef: sidebarRef });
  const close = () => setShowNav(false);
  const go = () => { close(); };
  const isActive = (href) => href === "/" ? pathname === "/" : pathname.startsWith(href);
  const links = [
    ["Home", "/", FiHome],
    ["Your Library", "/library", FiDisc],
    ["Recently Played", "/recently-played", FiDisc],
    ["Liked Songs", "/library/liked", FiHeart],
    ["Following", "/following", FiUsers],
    ...(canUseArcade(session?.user?.email) ? [["Beat Arcade", "/arcade", MdSportsEsports]] : []),
    ["Settings", "/settings", FiSettings],
  ];
  return (
    <aside ref={sidebarRef} id="app-sidebar" className={`app-sidebar kasa-sidebar ${showNav ? "is-open" : ""} ${collapsed ? "is-collapsed" : ""}`} aria-label="Main menu" {...(navModal ? { role: "dialog", "aria-modal": true } : {})}>
      <div className="sidebar-head"><div className="sidebar-brand">
        <BrandMark onClick={go} compact={collapsed} />
        <div className="sidebar-head-actions">
          <button type="button" onClick={toggleCollapsed} className="sidebar-toggle icon-btn hidden md:inline-flex items-center justify-center" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? <FiChevronRight aria-hidden="true" /> : <FiChevronLeft aria-hidden="true" />}
          </button>
          <button type="button" onClick={close} className="sidebar-toggle icon-btn md:hidden" aria-label="Close menu"><IoClose aria-hidden="true" className="text-xl" /></button>
        </div>
      </div></div>
      <nav aria-label="Primary" className="kasa-sidebar-nav">
        <Link href="/" onClick={go} aria-current={isActive("/") ? "page" : undefined} title={collapsed ? "Home" : undefined} className={`nav-link ${isActive("/") ? "is-active" : ""}`}><FiHome aria-hidden="true" className="shrink-0 text-xl" /><span className={collapsed ? "md:hidden" : ""}>Home</span></Link>
        <Link href="/search" onClick={go} aria-current={isActive("/search") ? "page" : undefined} title={collapsed ? "Search" : undefined} className={`nav-link ${isActive("/search") ? "is-active" : ""}`}><FiSearch aria-hidden="true" className="shrink-0 text-xl" /><span className={collapsed ? "md:hidden" : ""}>Search</span></Link>
        {collapsed && <Link href="/library" onClick={go} className="nav-link hidden md:flex" title="Your Library" aria-label="Your Library"><FiDisc aria-hidden="true" className="text-xl" /></Link>}
      </nav>
      <div className={`kasa-library-scroll ${collapsed ? "md:hidden" : ""}`}>
        <div className="kasa-library-pills" aria-label="Library navigation">
          <Link href="/library" onClick={go} aria-current={pathname === "/library" ? "page" : undefined}>Playlists</Link>
          <Link href="/following" onClick={go} aria-current={isActive("/following") ? "page" : undefined}>Artists</Link>
          <Link href="/library/liked" onClick={go} aria-current={isActive("/library/liked") ? "page" : undefined}>Liked Songs</Link>
        </div>
        <Playlists />
        <details className="kasa-sidebar-extra"><summary>More from KASA</summary>
          <nav aria-label="Library and account">
            {links.filter(([, href]) => href !== "/").map(([label, href, Icon]) => (
              <Link key={href} href={href} onClick={go} aria-current={isActive(href) ? "page" : undefined} className={`nav-link ${isActive(href) ? "is-active" : ""}`}><Icon aria-hidden="true" className="text-lg shrink-0" /><span>{label}</span></Link>
            ))}
            {status === "unauthenticated" && <Link href="/signup" onClick={go} className="nav-link">Create account</Link>}
          </nav>
          <Profile /><Languages />
        </details>
      </div>
    </aside>
  );
};
export default Sidebar;

