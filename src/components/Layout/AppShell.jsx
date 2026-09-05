"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Toaster } from "react-hot-toast";
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar/Sidebar";
import ErrorBoundary from "@/components/ErrorBoundary";
import OnlineStatus from "@/components/Homepage/OnlineStatus";
import PullToRefresh from "@/components/PullToRefresh";
import { JamProvider } from "@/components/Jam/JamProvider";

const MusicPlayer = dynamic(
  () => import("@/components/MusicPlayer"),
  { ssr: false },
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
  const pathname = usePathname();
  const [showNav, setShowNav] = useState(false);
  const [isCompactNav, setIsCompactNav] = useState(false);

  useEffect(() => {
    setShowNav(false);
  }, [pathname]);

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
    () => ({ showNav, setShowNav, navModal }),
    [navModal, showNav],
  );

  return (
    <NavContext.Provider value={value}>
      <JamProvider>
      <div className="app-shell">
        <Sidebar />
        <button
          type="button"
          aria-label="Close navigation"
          aria-hidden={!showNav}
          tabIndex={-1}
          className={`app-overlay lg:hidden ${showNav ? "is-open" : ""}`}
          onClick={() => setShowNav(false)}
        />
        <div className="app-stage" inert={navModal}>
          <GhostFibers
            className="app-ghost-fibers"
            lineColor="#0a5c66"
            glowColor="#00e6e6"
            backdropColor="#000814"
            speed={0.18}
            scale={2.1}
            rotation={-8}
            rotationSpeed={0.16}
            layers={4}
            glowIntensity={1.2}
            brightness={1.4}
            blueBoost={0.9}
            vignette={0.74}
            grain={0.035}
            fps={45}
          />
          <div className="app-ghost-fibers-shade" aria-hidden="true" />
          <Navbar />
          <div className="app-content" id="main-content" tabIndex={-1}>
            <PullToRefresh />
            <OnlineStatus />
            {children}
            <footer className="mt-12 mb-6 border-t border-white/10 pt-6 text-center text-xs text-[#9aa8b5]">
              <div className="flex justify-center gap-4">
                <Link href="/terms" className="transition hover:text-white">Terms of Service</Link>
                <Link href="/privacy" className="transition hover:text-white">Privacy Policy</Link>
                <Link href="/accessibility" className="transition hover:text-white">Accessibility</Link>
              </div>
              <p className="mt-4">&copy; {new Date().getFullYear()} HeyKasa Music. All rights reserved.</p>
            </footer>
          </div>
        </div>
        <div className="app-player" id="player" tabIndex={-1}>
          <ErrorBoundary
            name="Music player"
            title="The music player stopped"
            message="Reload the player to keep listening. Your queue and library are safe."
          >
            <MusicPlayer />
          </ErrorBoundary>
        </div>
        <JamController />
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
            background: "#07121d",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.1)",
          },
        }}
      />
    </NavContext.Provider>
  );
}
