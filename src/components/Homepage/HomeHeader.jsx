"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

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
  const [imageFailed, setImageFailed] = useState(false);
  const [hello, setHello] = useState("Welcome");
  const userName =
    typeof session?.user?.name === "string" && session.user.name.trim()
      ? session.user.name.trim()
      : "Account";
  const rawImageUrl = session?.user?.image || session?.user?.imageUrl;
  const imageUrl = typeof rawImageUrl === "string" ? rawImageUrl : "";

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  useEffect(() => {
    setHello(greetingForHour(new Date().getHours()));
  }, []);

  const href = status === "authenticated" ? "/settings" : status === "unauthenticated" ? "/login" : null;
  const label =
    status === "authenticated"
      ? `Open settings for ${userName}`
      : status === "unauthenticated"
        ? "Log in"
        : "Loading account";

  return (
    <header className="home-header">
      <div className="home-chips no-scrollbar" role="tablist" aria-label="Home filters">
        {FILTERS.map((item) => {
          const active = filter === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onFilter(item.id)}
              className={`home-chip ${active ? "is-active" : ""}`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div className="home-header-row">
        {href ? (
          <Link href={href} aria-label={label} title={label} className="home-avatar ring-1 ring-white/20 md:hidden">
            {status === "authenticated" && imageUrl && !imageFailed ? (
              <img
                src={imageUrl}
                alt=""
                onError={() => setImageFailed(true)}
                className="h-full w-full object-cover"
              />
            ) : status === "authenticated" ? (
              <span aria-hidden="true">{userName.charAt(0).toUpperCase()}</span>
            ) : (
              <span aria-hidden="true">H</span>
            )}
          </Link>
        ) : (
          <span
            className="home-avatar animate-pulse bg-white/10 ring-1 ring-white/20 md:hidden"
            role="status"
            aria-label={label}
          />
        )}
        <div className="home-title-copy">
          <span className="home-eyebrow">YOUR DAILY SOUND</span>
          <h1 className="home-display">{hello}</h1>
          <p className="home-subtitle">Fresh picks, familiar favourites, and your next obsession.</p>
        </div>
      </div>
    </header>
  );
}
