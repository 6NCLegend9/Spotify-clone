"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Toaster } from "react-hot-toast";
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar/Sidebar";

const MusicPlayer = dynamic(
  () => import("@/components/MusicPlayer"),
  { ssr: false },
);

const GhostFibers = dynamic(
  () => import("@/components/ReactBits/GhostFibers"),
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

  useEffect(() => {
    setShowNav(false);
  }, [pathname]);

  useEffect(() => {
    if (!showNav) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setShowNav(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showNav]);

  const value = useMemo(() => ({ showNav, setShowNav }), [showNav]);

  return (
    <NavContext.Provider value={value}>
      <div className="app-shell">
        <Sidebar />
        <div
          className={`app-overlay lg:hidden ${showNav ? "is-open" : ""}`}
          onClick={() => setShowNav(false)}
        />
        <div className="app-stage">
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
          <div className="app-content">{children}</div>
        </div>
        <div className="app-player">
          <MusicPlayer />
        </div>
      </div>
      <Toaster
        position="top-center"
        toastOptions={{
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
