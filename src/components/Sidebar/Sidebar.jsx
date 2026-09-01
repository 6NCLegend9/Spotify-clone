"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useDispatch } from "react-redux";
import { FaGithub } from "react-icons/fa";
import { FiHeart, FiHome, FiSettings, FiDisc, FiGrid } from "react-icons/fi";
import { IoClose } from "react-icons/io5";
import { setProgress } from "@/redux/features/loadingBarSlice";
import BrandMark from "../Layout/BrandMark";
import { useNav } from "../Layout/AppShell";
import Profile from "./Profile";
import Languages from "./Languages";
import Playlists from "./Playlists";

const Sidebar = () => {
  const { showNav, setShowNav } = useNav();
  const pathname = usePathname();
  const dispatch = useDispatch();
  const { status } = useSession();

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
    ["Genres", "/genres", FiGrid],
    ["Liked Songs", "/library/liked", FiHeart],
    ["Settings", "/settings", FiSettings],
  ];

  return (
    <aside className={`app-sidebar ${showNav ? "is-open" : ""}`}>
      <div className="flex h-16 items-center justify-between px-4">
        <BrandMark variant="white" onClick={go} />
        <button
          type="button"
          onClick={close}
          className="icon-btn lg:hidden"
          aria-label="Close menu"
        >
          <IoClose className="text-xl" />
        </button>
      </div>

      <div className="px-3 pb-3">
        <Profile />
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-4">
        {links.map(([label, href, Icon]) => (
          <Link
            key={href}
            href={href}
            onClick={go}
            className={`nav-link ${isActive(href) ? "is-active" : ""}`}
          >
            <Icon className="text-lg" />
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
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-sm text-[#9aa8b5] transition hover:text-[#00e6e6]"
        >
          <FaGithub />
          Github
        </a>
      </div>
    </aside>
  );
};

export default Sidebar;
