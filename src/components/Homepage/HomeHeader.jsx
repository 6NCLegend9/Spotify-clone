"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { FiSettings } from "react-icons/fi";
import { useSelector } from "react-redux";
import { useNav } from "../Layout/AppShell";
import { selectEffectiveAppearance } from "@/redux/features/appearanceSlice";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "music", label: "Music" },
  { id: "podcasts", label: "Podcasts" },
];
function greetingForHour(hour) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
export default function HomeHeader({ filter, onFilter }) {
  const { data: session, status } = useSession();
  const { setShowNav, navModal } = useNav();
  const [imageFailed, setImageFailed] = useState(false);
  const [hello, setHello] = useState("Welcome");
  const appearance = useSelector(selectEffectiveAppearance);
  const homeAppearance = appearance?.activeProfile?.home;
  const customMessage = homeAppearance?.visible === true
    ? String(homeAppearance.message || "").trim()
    : "";
  const homeSize = ["small", "medium", "large"].includes(homeAppearance?.size)
    ? homeAppearance.size
    : "medium";
  const homeAlign = ["left", "center", "right"].includes(homeAppearance?.align)
    ? homeAppearance.align
    : "left";
  const userName = typeof session?.user?.name === "string" && session.user.name.trim() ? session.user.name.trim() : "Account";
  const rawImageUrl = session?.user?.image || session?.user?.imageUrl;
  const imageUrl = typeof rawImageUrl === "string" ? rawImageUrl : "";
  useEffect(() => { setImageFailed(false); }, [imageUrl]);
  useEffect(() => { setHello(greetingForHour(new Date().getHours())); }, []);
  const href = status === "authenticated" ? "/settings" : status === "unauthenticated" ? "/login" : null;
  const label = status === "authenticated" ? `Open settings for ${userName}` : status === "unauthenticated" ? "Log in" : "Loading account";
  const guest = status !== "authenticated";
  return (
    <header className="home-header">
      <div className="kasa-home-filters">
        <button type="button" className="home-avatar grid place-items-center md:hidden" aria-label="Open menu" aria-controls="app-sidebar" aria-expanded={navModal} onClick={() => setShowNav(true)}>
          {status === "authenticated" && imageUrl && !imageFailed ? <img src={imageUrl} alt="" onError={() => setImageFailed(true)} className="h-full w-full object-cover" /> : <span aria-hidden="true">{status === "authenticated" ? userName.charAt(0).toUpperCase() : "K"}</span>}
        </button>
        <div className="home-chips no-scrollbar" role="group" aria-label="Home filters">
          {FILTERS.map((item) => {
            const active = filter === item.id;
            return <button key={item.id} type="button" aria-pressed={active} onClick={() => onFilter(item.id)} className={`home-chip ${active ? "is-active" : ""}`}>{item.label}</button>;
          })}
        </div>
        {href ? <Link href={href} aria-label={label} title={label} className="ml-auto grid h-11 w-11 shrink-0 place-items-center text-[var(--teal)] md:hidden"><FiSettings size={22} /></Link> : <span className="ml-auto h-8 w-8 animate-pulse rounded-full bg-white/10 md:hidden" role="status" aria-label={label} />}
      </div>
      <div className="home-header-row">
        <div className={`home-title-copy appearance-home-text--${homeAlign}`}>
          <h1 className={`home-display ${customMessage ? `appearance-home-text--${homeSize}` : ""}`}>
            {customMessage || (guest ? "Free. No ads. Jam." : hello)}
          </h1>
          <p className="home-subtitle">
            {guest
              ? "Listen now. Save, follow, and Jam when you make an account."
              : "Music for a brighter today."}
          </p>
          {guest ? (
            <p className="home-guest-beats">
              <span>Free</span>
              <span>No ads</span>
              <span>Jam</span>
            </p>
          ) : null}
        </div>
      </div>
    </header>
  );
}
