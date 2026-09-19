"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { GoHome, GoHomeFill } from "react-icons/go";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { MdOutlineMenu, MdSportsEsports } from "react-icons/md";
import BrandMark from "./Layout/BrandMark";
import { useNav } from "./Layout/AppShell";
import Searchbar from "./Searchbar";
import UpdatesBell from "./UpdatesBell";
import { canUseArcade } from "@/utils/arcadeAccess";
import styles from "./Layout/KasaShell.module.css";

const Navbar = () => {
  const { setShowNav, navModal } = useNav();
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [imageFailed, setImageFailed] = useState(false);
  const [historyState, setHistoryState] = useState({ canBack: false, canForward: true });
  const homeActive = pathname === "/";
  const userName =
    typeof session?.user?.name === "string" && session.user.name.trim()
      ? session.user.name.trim()
      : "Account";
  const rawImageUrl = session?.user?.image || session?.user?.imageUrl;
  const imageUrl = typeof rawImageUrl === "string" ? rawImageUrl : "";

  useEffect(() => { setImageFailed(false); }, [imageUrl]);

  useEffect(() => {
    const sync = () => {
      const navigation = window.navigation;
      setHistoryState({
        canBack: typeof navigation?.canGoBack === "boolean" ? navigation.canGoBack : window.history.length > 1,
        canForward: typeof navigation?.canGoForward === "boolean" ? navigation.canGoForward : true,
      });
    };
    sync();
    const navigation = window.navigation;
    const deferredSync = () => window.setTimeout(sync, 0);
    window.addEventListener("popstate", deferredSync);
    window.addEventListener("pageshow", deferredSync);
    navigation?.addEventListener?.("navigatesuccess", deferredSync);
    return () => {
      window.removeEventListener("popstate", deferredSync);
      window.removeEventListener("pageshow", deferredSync);
      navigation?.removeEventListener?.("navigatesuccess", deferredSync);
    };
  }, [pathname]);

  const goBack = () => {
    const navigation = window.navigation;
    if (typeof navigation?.canGoBack === "boolean") {
      if (navigation.canGoBack) void navigation.back();
      return;
    }
    if (window.history.length > 1) router.back();
  };

  const goForward = () => {
    const navigation = window.navigation;
    if (typeof navigation?.canGoForward === "boolean") {
      if (navigation.canGoForward) void navigation.forward();
      return;
    }
    router.forward();
  };

  return (
    <header className={`app-navbar ${styles.navbar} ${pathname?.startsWith("/search") ? styles.searchRoute : ""}`}>
      <div className="navbar-slot navbar-slot-start">
        <button type="button" onClick={() => setShowNav(true)} className="icon-btn h-11 w-11 shrink-0 md:hidden" aria-label="Open menu" aria-expanded={navModal} aria-controls="app-sidebar">
          <MdOutlineMenu aria-hidden="true" className="text-xl" />
        </button>
        <button type="button" onClick={goBack} disabled={!historyState.canBack} className="icon-btn h-11 w-11 shrink-0 md:hidden disabled:cursor-not-allowed disabled:opacity-35" aria-label="Go back" title="Go back">
          <FiChevronLeft aria-hidden="true" size={22} />
        </button>
        <BrandMark compact className="hidden shrink-0 sm:flex md:hidden" />
        <div className={styles.history} aria-label="Navigation history">
          <button type="button" onClick={goBack} disabled={!historyState.canBack} aria-label="Go back" title="Go back"><FiChevronLeft size={20} /></button>
          <button type="button" onClick={goForward} disabled={!historyState.canForward} aria-label="Go forward" title="Go forward"><FiChevronRight size={20} /></button>
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
        {status === "authenticated" ? (
          <Link href="/settings" aria-label={`Open settings for ${userName}`} title="Open settings" className={styles.account}>
            {imageUrl && !imageFailed ? <img src={imageUrl} alt="" onError={() => setImageFailed(true)} /> : <span aria-hidden="true">{userName.charAt(0).toUpperCase()}</span>}
            <span className={styles.accountName}>{userName}</span>
          </Link>
        ) : status === "unauthenticated" ? (
          <Link href="/login" prefetch className="btn-primary h-8 px-2.5 text-xs sm:h-10 sm:px-4 sm:text-sm">Log in</Link>
        ) : <span className="h-8 w-8 animate-pulse rounded-full bg-white/10 sm:h-10 sm:w-10" role="status" aria-label="Loading account" />}
      </div>
    </header>
  );
};
export default Navbar;
