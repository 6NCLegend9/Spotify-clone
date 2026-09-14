"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { FiChevronLeft, FiChevronRight, FiDisc, FiGrid, FiHeart, FiHome, FiList, FiSearch, FiSettings, FiUsers } from "react-icons/fi";
import { MdSportsEsports } from "react-icons/md";
import { canUseArcade } from "@/utils/arcadeAccess";
import { IoClose } from "react-icons/io5";
import BrandMark from "../Layout/BrandMark";
import { useNav } from "../Layout/AppShell";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import Profile from "./Profile";
import Languages from "./Languages";
import Playlists from "./Playlists";
import styles from "../Layout/navigation.module.css";

const Sidebar = () => {
  const { showNav, setShowNav, navModal, collapsed, toggleCollapsed } = useNav();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const sidebarRef = useRef(null);
  const [query, setQuery] = useState("");
  const [layout, setLayout] = useState("list");

  useFocusTrap({ enabled: Boolean(navModal), onClose: () => setShowNav(false), containerRef: sidebarRef });
  const close = () => setShowNav(false);
  const go = () => { close(); };
  const isActive = (href) => href === "/" ? pathname === "/" : pathname.startsWith(href);
  const links = [
    ["Home", "/", FiHome],
    ["Your Library", "/library", FiDisc],
    ["Liked Songs", "/library/liked", FiHeart],
    ["Following", "/following", FiUsers],
    ...(canUseArcade(session?.user?.email) ? [["Beat Arcade", "/arcade", MdSportsEsports]] : []),
    ["Settings", "/settings", FiSettings],
  ];
  const renderLink = ([label, href, Icon]) => <Link key={href} href={href} onClick={go}
    title={collapsed ? label : undefined} aria-current={isActive(href) ? "page" : undefined}
    className={`nav-link ${isActive(href) ? "is-active" : ""}`}>
    <Icon aria-hidden="true" className="text-lg shrink-0" /><span className={collapsed ? "md:hidden" : ""}>{label}</span>
  </Link>;

  return <aside ref={sidebarRef} id="app-sidebar" className={`app-sidebar ${showNav ? "is-open" : ""} ${collapsed ? "is-collapsed" : ""}`}
    aria-label="Main menu" {...(navModal ? { role: "dialog", "aria-modal": true } : {})}>
    <div className="sidebar-head"><div className="sidebar-brand">
      <BrandMark onClick={go} compact={collapsed} />
      <div className="sidebar-head-actions">
        <button type="button" onClick={toggleCollapsed} className="sidebar-toggle icon-btn hidden md:inline-flex items-center justify-center"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? <FiChevronRight aria-hidden="true" /> : <FiChevronLeft aria-hidden="true" />}
        </button>
        <button type="button" onClick={close} className="sidebar-toggle icon-btn md:hidden" aria-label="Close menu"><IoClose aria-hidden="true" className="text-xl" /></button>
      </div>
    </div></div>
    <nav aria-label="Primary" className={`flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pb-4 kasa-library-scroll ${collapsed ? "px-1.5" : "px-3"}`}>
      {renderLink(links[0])}
      {renderLink(["Search", "/search", FiSearch])}
      <div className={styles.libraryHead}>{renderLink(links[1])}</div>
      {!collapsed && <>
        <div className={styles.libraryFilters}>
          <span className={styles.selectedPill}>Playlists</span>
          <Link href="/following" onClick={go}>Artists</Link>
        </div>
        <div className={styles.libraryTools}>
          <label><FiSearch aria-hidden="true" /><input type="search" aria-label="Filter your playlists" placeholder="Filter your library..." value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <button type="button" aria-label={layout === "list" ? "Show playlist grid" : "Show playlist list"} aria-pressed={layout === "grid"} onClick={() => setLayout(layout === "list" ? "grid" : "list")}>
            {layout === "list" ? <FiGrid /> : <FiList />}
          </button>
        </div>
      </>}
      {renderLink(links[2])}
      <div className={collapsed ? "md:hidden" : ""}><Playlists query={query} layout={layout} /></div>
      <div className={styles.sidebarFooter}>
        {links.slice(3).map(renderLink)}
        {status === "unauthenticated" && <Link href="/signup" onClick={go} className={`nav-link ${collapsed ? "md:hidden" : ""}`}>Create account</Link>}
        <div className={collapsed ? "md:hidden" : ""}><Languages /><Profile /></div>
      </div>
    </nav>
  </aside>;
};
export default Sidebar;
