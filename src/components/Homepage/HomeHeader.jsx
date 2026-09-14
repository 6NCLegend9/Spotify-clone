"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { FiSettings } from "react-icons/fi";
import BrandMark from "../Layout/BrandMark";
import styles from "../Layout/navigation.module.css";

const FILTERS = [{ id: "all", label: "All" }, { id: "music", label: "Music" }, { id: "podcasts", label: "Podcasts" }];
function greetingForHour(hour) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
export default function HomeHeader({ filter, onFilter }) {
  const { data: session, status } = useSession();
  const [imageFailed, setImageFailed] = useState(false);
  const [hello, setHello] = useState("Welcome");
  const userName = typeof session?.user?.name === "string" && session.user.name.trim() ? session.user.name.trim() : "Account";
  const rawImageUrl = session?.user?.image || session?.user?.imageUrl;
  const imageUrl = typeof rawImageUrl === "string" ? rawImageUrl : "";
  useEffect(() => { setImageFailed(false); }, [imageUrl]);
  useEffect(() => { setHello(greetingForHour(new Date().getHours())); }, []);
  const href = status === "authenticated" ? "/settings" : status === "unauthenticated" ? "/login" : null;
  const label = status === "authenticated" ? `Open settings for ${userName}` : status === "unauthenticated" ? "Log in" : "Loading account";
  return <header className={styles.homeHeader}>
    <div className={styles.homeTopRow}>
      {href ? <Link href={href} aria-label={label} title={label} className={styles.homeAvatar}>
        {status === "authenticated" && imageUrl && !imageFailed ? <img src={imageUrl} alt="" onError={() => setImageFailed(true)} /> : <span aria-hidden="true">{status === "authenticated" ? userName.charAt(0).toUpperCase() : "K"}</span>}
      </Link> : <span className={styles.homeAvatar} role="status" aria-label={label} />}
      <div className={styles.filters} aria-label="Home filters">
        {FILTERS.map((item) => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => onFilter(item.id)} className={filter === item.id ? styles.selected : ""}>{item.label}</button>)}
      </div>
      <Link href="/settings" className={styles.homeSettings} aria-label="Settings"><FiSettings size={21} /></Link>
    </div>
    <div className={styles.greetingRow}><div><h1>{hello}</h1><p>Music for a brighter today.</p></div><BrandMark className={styles.mobileBrand} /></div>
  </header>;
}
