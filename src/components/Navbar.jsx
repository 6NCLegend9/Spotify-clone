"use client";

import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { GoHome, GoHomeFill } from "react-icons/go";
import { FiChevronLeft } from "react-icons/fi";
import { CircleArrowDown } from "lucide-react";
import BrandMark from "./Layout/BrandMark";
import { useNav } from "./Layout/AppShell";
import Searchbar from "./Searchbar";
import UpdatesBell from "./UpdatesBell";
import ItemMenu from "./ItemMenu";
import { canUseArcade } from "@/utils/arcadeAccess";
import styles from "./Layout/KasaShell.module.css";

const Navbar = () => {
  const { setShowNav, navModal } = useNav();
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [imageFailed, setImageFailed] = useState(false);
  const [canBack, setCanBack] = useState(false);
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
      setCanBack(typeof navigation?.canGoBack === "boolean" ? navigation.canGoBack : window.history.length > 1);
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

  return (
    <header inert={navModal ? "" : undefined} className={`app-navbar ${styles.navbar}`}>
      <div className="navbar-slot navbar-slot-start">
        <div className={styles.brand}><BrandMark compact /></div>
        <button type="button" onClick={() => setShowNav(true)} className={`phone-only-grid ${styles.mobileAvatar}`} aria-label="Open navigation" aria-expanded={navModal} aria-controls="app-sidebar">
          {status === "authenticated" && imageUrl && !imageFailed ? <img src={imageUrl} alt="" onError={() => setImageFailed(true)} /> : <span aria-hidden="true">{status === "authenticated" ? userName.charAt(0).toUpperCase() : "H"}</span>}
        </button>
        <button type="button" onClick={goBack} disabled={!canBack} className="icon-btn phone-only-grid h-11 w-11 shrink-0 disabled:cursor-not-allowed disabled:opacity-35" aria-label="Go back" title="Go back">
          <FiChevronLeft aria-hidden="true" size={22} />
        </button>
      </div>
      <div className="navbar-search-cluster">
        <Link href="/" aria-label="Home" title="Home" aria-current={homeActive ? "page" : undefined} className={`nav-home-btn ${homeActive ? "is-active" : ""}`}>
          {homeActive ? <GoHomeFill aria-hidden="true" /> : <GoHome aria-hidden="true" />}
        </Link>
        <Searchbar />
      </div>
      <div className="navbar-slot navbar-slot-end">
        <Link href="/open-desktop" className={styles.install}><CircleArrowDown aria-hidden="true" size={18} />Install app</Link>
        {status === "authenticated" && <UpdatesBell />}
        {status === "authenticated" ? (
          <ItemMenu label={`Account menu for ${userName}`} className={styles.account} actions={[
            { label: "Your library", onSelect: () => router.push("/library") },
            { label: "Recently played", onSelect: () => router.push("/recently-played") },
            { label: "Following", onSelect: () => router.push("/following") },
            { label: "Settings", onSelect: () => router.push("/settings") },
            canUseArcade(session?.user?.email) && { label: "Beat Arcade", onSelect: () => router.push("/arcade") },
            { label: "Log out", onSelect: () => signOut({ callbackUrl: "/" }) },
          ]}>
            {imageUrl && !imageFailed ? <img src={imageUrl} alt="" onError={() => setImageFailed(true)} /> : <span aria-hidden="true">{userName.charAt(0).toUpperCase()}</span>}
          </ItemMenu>
        ) : status === "unauthenticated" ? (
          <><Link href="/signup" className={styles.signup}>Sign up</Link><Link href="/login" prefetch className={styles.login}>Log in</Link></>
        ) : <span className="h-8 w-8 animate-pulse rounded-full bg-white/10 sm:h-10 sm:w-10" role="status" aria-label="Loading account" />}
      </div>
    </header>
  );
};
export default Navbar;
