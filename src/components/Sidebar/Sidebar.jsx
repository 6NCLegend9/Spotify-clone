"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { FiDisc, FiHeart, FiHome, FiSearch, FiSettings, FiUsers } from "react-icons/fi";
import { ArrowRight, LibraryBig, Plus } from "lucide-react";
import { MdSportsEsports } from "react-icons/md";
import { canUseArcade } from "@/utils/arcadeAccess";
import { IoClose } from "react-icons/io5";
import { useNav } from "../Layout/AppShell";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import Playlists from "./Playlists";
import ItemMenu from "../ItemMenu";
import { requestJamOpen } from "@/utils/jam.mjs";

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
        <button type="button" onClick={toggleCollapsed} className="sidebar-library-title" aria-expanded={!collapsed} aria-controls="sidebar-library-content" aria-label={collapsed ? "Expand your library" : "Collapse your library"} title="Your Library"><LibraryBig aria-hidden="true" size={24} />{!collapsed && <span>Your Library</span>}</button>
        <div className="sidebar-head-actions">
          <ItemMenu label="Create" actions={[
            { label: "Create playlist", onSelect: () => window.dispatchEvent(new Event("heykasa:create-playlist")) },
            { label: "Start a Jam", onSelect: () => status === "authenticated" ? requestJamOpen() : window.dispatchEvent(new Event("heykasa:open-create")) },
          ]}><Plus aria-hidden="true" size={22} /></ItemMenu>
          <Link href="/library" onClick={go} className="sidebar-toggle icon-btn non-phone-only-inline-flex" aria-label="Open full library" title="Open full library"><ArrowRight aria-hidden="true" size={20} /></Link>
          <button type="button" onClick={close} className="sidebar-toggle icon-btn phone-only-flex" aria-label="Close menu"><IoClose aria-hidden="true" className="text-xl" /></button>
        </div>
      </div></div>
      {!collapsed && <nav aria-label="Primary" className="kasa-sidebar-nav">
        <Link href="/" onClick={go} aria-current={isActive("/") ? "page" : undefined} title={collapsed ? "Home" : undefined} className={`nav-link ${isActive("/") ? "is-active" : ""}`}><FiHome aria-hidden="true" className="shrink-0 text-xl" /><span className={collapsed ? "phone-only-inline" : ""}>Home</span></Link>
        <Link href="/search" onClick={go} aria-current={isActive("/search") ? "page" : undefined} title={collapsed ? "Search" : undefined} className={`nav-link ${isActive("/search") ? "is-active" : ""}`}><FiSearch aria-hidden="true" className="shrink-0 text-xl" /><span className={collapsed ? "phone-only-inline" : ""}>Search</span></Link>
      </nav>}
      <div id="sidebar-library-content" className="kasa-library-scroll">
        <Playlists compact={collapsed} />
        {!collapsed && <details className="kasa-sidebar-extra phone-only-block"><summary>More from HayKasa</summary>
          <nav aria-label="Library and account">
            {links.filter(([, href]) => href !== "/").map(([label, href, Icon]) => (
              <Link key={href} href={href} onClick={go} aria-current={isActive(href) ? "page" : undefined} className={`nav-link ${isActive(href) ? "is-active" : ""}`}><Icon aria-hidden="true" className="text-lg shrink-0" /><span>{label}</span></Link>
            ))}
            {status === "unauthenticated" && <Link href="/signup" onClick={go} className="nav-link">Create account</Link>}
          </nav>
        </details>}
      </div>
    </aside>
  );
};
export default Sidebar;

