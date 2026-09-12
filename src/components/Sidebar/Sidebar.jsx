"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { FaGithub } from "react-icons/fa";
import { FiChevronLeft, FiChevronRight, FiDisc, FiFileText, FiHeart, FiHome, FiInfo, FiSettings, FiShield, FiUsers } from "react-icons/fi";
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

  useFocusTrap({
    enabled: Boolean(navModal),
    onClose: () => setShowNav(false),
    containerRef: sidebarRef,
  });

  const close = () => setShowNav(false);
  const go = () => {
    close();
  };

  const isActive = (href) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const links = [
    ["Home", "/", FiHome],
    ["Your Library", "/library", FiDisc],
    ["Liked Songs", "/library/liked", FiHeart],
    ["Following", "/following", FiUsers],
    ...(canUseArcade(session?.user?.email) ? [["Beat Arcade", "/arcade", MdSportsEsports]] : []),
    ["Settings", "/settings", FiSettings],
    ["Terms of Service", "/terms", FiFileText],
    ["Privacy Policy", "/privacy", FiShield],
    ["Accessibility", "/accessibility", FiInfo],
  ];

  return (
    <aside
      ref={sidebarRef}
      id="app-sidebar"
      className={`app-sidebar ${showNav ? "is-open" : ""} ${collapsed ? "is-collapsed" : ""}`}
      aria-label="Main menu"
      {...(navModal ? { role: "dialog", "aria-modal": true } : {})}
    >
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

      <div className={`px-3 pb-3 ${collapsed ? "md:hidden" : ""}`}>
        <Profile />
      </div>

      <nav
        aria-label="Primary"
        className={`flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pb-4 ${collapsed ? "px-1.5" : "px-3"}`}
      >
        {links.map(([label, href, Icon]) => (
          <Link
            key={href}
            href={href}
            onClick={go}
            title={collapsed ? label : undefined}
            aria-current={isActive(href) ? "page" : undefined}
            className={`nav-link ${isActive(href) ? "is-active" : ""}`}
          >
            <Icon aria-hidden="true" className="text-lg shrink-0" />
            <span className={collapsed ? "md:hidden" : ""}>{label}</span>
          </Link>
        ))}

        {status === "unauthenticated" && (
          <Link href="/signup" onClick={go} className={`nav-link ${collapsed ? "md:hidden" : ""}`}>
            Create account
          </Link>
        )}

        <div className={`mt-3 border-t border-white/10 pt-3 ${collapsed ? "md:hidden" : ""}`}>
          <Languages />
        </div>
        <div className={`border-t border-white/10 pt-2 ${collapsed ? "md:hidden" : ""}`}>
          <Playlists />
        </div>
      </nav>

      <div className={`border-t border-white/10 px-4 py-4 ${collapsed ? "md:hidden" : ""}`}>
        <a
          href="https://github.com/6NCLegend9"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-[#9aa8b5] transition hover:text-[#00e6e6]"
        >
          <FaGithub aria-hidden="true" />
          GitHub
        </a>
      </div>
    </aside>
  );
};

export default Sidebar;
