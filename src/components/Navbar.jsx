"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { GoHome, GoHomeFill } from "react-icons/go";
import { MdOutlineMenu, MdSportsEsports } from "react-icons/md";
import { FiChevronLeft, FiChevronRight, FiChevronDown } from "react-icons/fi";
import BrandMark from "./Layout/BrandMark";
import { useNav } from "./Layout/AppShell";
import Searchbar from "./Searchbar";
import UpdatesBell from "./UpdatesBell";
import Profile from "./Sidebar/Profile";
import { canUseArcade } from "@/utils/arcadeAccess";
import styles from "./Layout/navigation.module.css";

const Navbar = () => {
  const { setShowNav, navModal } = useNav();
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [imageFailed, setImageFailed] = useState(false);
  const homeActive = pathname === "/";
  const userName = typeof session?.user?.name === "string" && session.user.name.trim() ? session.user.name.trim() : "Account";
  const rawImageUrl = session?.user?.image || session?.user?.imageUrl;
  const imageUrl = typeof rawImageUrl === "string" ? rawImageUrl : "";
  useEffect(() => { setImageFailed(false); }, [imageUrl]);

  return <header className="app-navbar">
    <div className="navbar-slot navbar-slot-start">
      <button type="button" onClick={() => setShowNav(true)} className="icon-btn h-11 w-11 shrink-0 md:hidden" aria-label="Open menu" aria-expanded={navModal} aria-controls="app-sidebar"><MdOutlineMenu aria-hidden="true" className="text-xl" /></button>
      <div className="hidden shrink-0 sm:flex md:hidden"><BrandMark compact /></div>
      <div className={styles.history}>
        <button type="button" aria-label="Go back" onClick={() => router.back()}><FiChevronLeft /></button>
        <button type="button" aria-label="Go forward" onClick={() => router.forward()}><FiChevronRight /></button>
      </div>
    </div>
    <div className="navbar-search-cluster">
      <Link href="/" aria-label="Home" title="Home" aria-current={homeActive ? "page" : undefined} className={`nav-home-btn ${homeActive ? "is-active" : ""}`}>
        {homeActive ? <GoHomeFill aria-hidden="true" /> : <GoHome aria-hidden="true" />}
      </Link>
      <Searchbar />
    </div>
    <div className="navbar-slot navbar-slot-end">
      <Link href="/arcade" className={`icon-btn h-11 w-11 shrink-0 ${canUseArcade(session?.user?.email) ? "" : "hidden"}`} aria-label="Open Beat Arcade" title="Beat Arcade"><MdSportsEsports aria-hidden="true" className="text-xl" /></Link>
      <UpdatesBell />
      {status === "authenticated" ? <details className={styles.account}>
        <summary aria-label={`Account menu for ${userName}`}>
          {imageUrl && !imageFailed ? <img src={imageUrl} alt="" onError={() => setImageFailed(true)} /> : <span className={styles.initial}>{userName.charAt(0).toUpperCase()}</span>}
          <span className={styles.userName}>{userName}</span><FiChevronDown aria-hidden="true" />
        </summary>
        <div className={styles.accountMenu}><Profile /><Link href="/settings" aria-label={`Open settings for ${userName}`}>Settings</Link></div>
      </details> : status === "unauthenticated" ? <Link href="/login" prefetch className="btn-primary h-8 px-2.5 text-xs sm:h-10 sm:px-4 sm:text-sm">Log in</Link> : <span className="h-8 w-8 animate-pulse rounded-full bg-white/10" role="status" aria-label="Loading account" />}
    </div>
  </header>;
};
export default Navbar;
