"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useDispatch } from "react-redux";
import { FaGithub } from "react-icons/fa";
import { FiDisc, FiFileText, FiHeart, FiHome, FiInfo, FiSettings, FiShield, FiUsers } from "react-icons/fi";
import { MdSportsEsports } from "react-icons/md";
import { canUseArcade } from "@/utils/arcadeAccess";
import { IoClose } from "react-icons/io5";
import { setProgress } from "@/redux/features/loadingBarSlice";
import BrandMark from "../Layout/BrandMark";
import { useNav } from "../Layout/AppShell";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import Profile from "./Profile";
import Languages from "./Languages";
import Playlists from "./Playlists";

const Sidebar = () => {
  const { showNav, setShowNav, navModal } = useNav();
  const pathname = usePathname();
  const dispatch = useDispatch();
  const { data: session, status } = useSession();
  const sidebarRef = useRef(null);

  useFocusTrap({
    enabled: Boolean(navModal),
    onClose: () => setShowNav(false),
    containerRef: sidebarRef,
  });

  const close = () => setShowNav(false);
  const go = () => {
    dispatch(setProgress(100));
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
      className={`app-sidebar ${showNav ? "is-open" : ""}`}
      aria-label="Main menu"
      {...(navModal ? { role: "dialog", "aria-modal": true } : {})}
    >
      <div className="flex h-16 items-center justify-between px-4">
        <BrandMark variant="white" onClick={go} />
        <button
          type="button"
          onClick={close}
          className="icon-btn md:hidden"
          aria-label="Close menu"
        >
          <IoClose aria-hidden="true" className="text-xl" />
        </button>
      </div>

      <div className="px-3 pb-3">
        <Profile />
      </div>

      <nav aria-label="Primary" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-4">
        {links.map(([label, href, Icon]) => (
          <Link
            key={href}
            href={href}
            onClick={go}
            aria-current={isActive(href) ? "page" : undefined}
            className={`nav-link ${isActive(href) ? "is-active" : ""}`}
          >
            <Icon aria-hidden="true" className="text-lg" />
            {label}
          </Link>
        ))}

        {status !== "authenticated" && (
          <Link href="/signup" onClick={go} className="nav-link">
            Create account
          </Link>
        )}

        <div className="mt-3 border-t border-white/10 pt-3">
          <Languages />
        </div>
        <div className="border-t border-white/10 pt-2">
          <Playlists />
        </div>
      </nav>

      <div className="border-t border-white/10 px-4 py-4">
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
