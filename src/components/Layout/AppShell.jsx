"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSelector } from "react-redux";
import { Toaster } from "react-hot-toast";
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar/Sidebar";
import MobileTabBar from "@/components/Layout/MobileTabBar";
import CreateHub from "@/components/Layout/CreateHub";
import Atmosphere from "@/components/Layout/Atmosphere";
import PageTransit from "@/components/Layout/PageTransit";
import ErrorBoundary from "@/components/ErrorBoundary";
import OnlineStatus from "@/components/Homepage/OnlineStatus";
import PullToRefresh from "@/components/PullToRefresh";
import { JamProvider } from "@/components/Jam/JamProvider";
import useNetworkRecovery from "@/hooks/useNetworkRecovery";
import useScrollPerformance from "@/hooks/useScrollPerformance";
import usePointerTilt from "@/hooks/usePointerTilt";
import PlaybackPersistence from "@/components/PlaybackPersistence";

const MusicPlayer = dynamic(
  () => import("@/components/MusicPlayer"),
  { ssr: false, loading: () => <div role="status" aria-label="Loading player" className="h-20 w-full animate-pulse bg-white/5 motion-reduce:animate-none" /> },
);

const GhostFibers = dynamic(
  () => import("@/components/ReactBits/GhostFibers"),
  { ssr: false },
);

const JamController = dynamic(
  () => import("@/components/Jam/JamController"),
  { ssr: false },
);

const NavContext = createContext(null);

export function useNav() {
  const context = useContext(NavContext);
  if (!context) {
    throw new Error("useNav must be used inside AppShell");
  }
  return context;
}

export default function AppShell({ children }) {
  const hasTrack = useSelector((state) => Boolean(state.player.youtubeVideo?.id || state.player.activeSong?.id));
  const fullScreen = useSelector((state) => Boolean(state.player.fullScreen));
  const pathname = usePathname();
  const [showNav, setShowNav] = useState(false);
  const [isCompactNav, setIsCompactNav] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("heykasa.sidebar.collapsed") === "true";
    } catch {
      return false;
    }
  });

  useNetworkRecovery();
  useScrollPerformance();
  usePointerTilt();

  useEffect(() => {
    setShowNav(false);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setIsCompactNav(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const focusSkipTarget = () => {
      const id = window.location.hash.replace(/^#/, "");
      if (id === "main-content" || id === "player") {
        document.getElementById(id)?.focus();
      }
    };
    focusSkipTarget();
    window.addEventListener("hashchange", focusSkipTarget);
    return () => window.removeEventListener("hashchange", focusSkipTarget);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("heykasa.sidebar.collapsed", String(next));
      } catch {
        // storage disabled or unavailable
      }
      return next;
    });
  };

  const navModal = showNav && isCompactNav;

  useEffect(() => {
    if (!navModal) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setShowNav(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navModal]);

  const value = useMemo(
    () => ({ showNav, setShowNav, navModal, collapsed, toggleCollapsed }),
    [collapsed, navModal, showNav],
  );

  return (
    <NavContext.Provider value={value}>
      <JamProvider>
      <PlaybackPersistence />
      <div
        className={`app-shell${collapsed ? " is-sidebar-collapsed" : ""}`}
        data-route={pathname === "/" ? "home" : "app"}
        data-player={fullScreen ? "full" : "dock"}
      >
        <Sidebar />
        <button
          type="button"
          aria-label="Close navigation"
          aria-hidden={!showNav}
          tabIndex={-1}
          className={`app-overlay md:hidden ${showNav ? "is-open" : ""}`}
          onClick={() => setShowNav(false)}
        />
        <div className="app-stage" inert={navModal}>
          <GhostFibers
            className="app-ghost-fibers"
            lineColor="#0a5c66"
            glowColor="#00e6e6"
            backdropColor="#000814"
            speed={0.22}
            scale={2.05}
            rotation={-12}
            rotationSpeed={0.18}
            layers={4}
            glowIntensity={1.75}
            brightness={1.62}
            blueBoost={1.1}
            vignette={0.76}
            grain={0.04}
            fps={42}
            dpr={0.85}
          />
          <div className="app-ghost-fibers-shade" aria-hidden="true" />
          <Atmosphere />
          <Navbar />
          <div className="app-content" id="main-content" tabIndex={-1}>
            <PullToRefresh />
            <OnlineStatus />
            <PageTransit pathname={pathname}>{children}</PageTransit>
            {pathname?.startsWith("/arcade") ? null : (
              <footer className="app-footer">
                <div className="flex justify-center gap-4">
                  <Link href="/terms" className="transition hover:text-white">Terms of Service</Link>
                  <Link href="/privacy" className="transition hover:text-white">Privacy Policy</Link>
                  <Link href="/accessibility" className="transition hover:text-white">Accessibility</Link>
                </div>
                <p className="mt-4">&copy; {new Date().getFullYear()} HeyKasa Music. All rights reserved.</p>
              </footer>
            )}
          </div>
          <JamController />
        </div>
        <div className="app-player" id="player" tabIndex={-1}>
          <ErrorBoundary
            name="Music player"
            title="The music player stopped"
            message="Reload the player to keep listening. Your queue and library are safe."
          >
            {hasTrack && <MusicPlayer />}
          </ErrorBoundary>
        </div>
        <MobileTabBar hidden={fullScreen} />
        <CreateHub />
      </div>
      </JamProvider>
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 4500,
          ariaProps: {
            role: "status",
            "aria-live": "polite",
          },
          style: {
            background: "rgba(7, 18, 29, 0.86)",
            color: "#fff",
            border: "1px solid rgba(0, 230, 230, 0.18)",
            backdropFilter: "blur(18px)",
            boxShadow: "0 16px 48px rgba(0, 8, 20, 0.45)",
          },
        }}
      />
    </NavContext.Provider>
  );
}
