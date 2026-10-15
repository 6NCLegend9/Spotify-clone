"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useSelector } from "react-redux";
import Link from "next/link";
import { FiClock, FiX } from "react-icons/fi";
import { accountOwner } from "@/utils/accountCache.mjs";
import { requestJson } from "@/services/http";
import UserMessage from "@/components/UserMessage";
import styles from "./search.module.css";

export default function RecentSearches() {
  const { data: session, status } = useSession();
  const privateSession = useSelector(state => state.settings.privateSession === true);
  const owner = accountOwner(session, status);
  if (status !== "authenticated" || privateSession) return null;
  return <AccountRecentSearches key={owner} />;
}

function AccountRecentSearches() {
  const [queries, setQueries] = useState([]);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [removing, setRemoving] = useState("");
  const controllerRef = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    setError(false);
    requestJson("/api/searches", { signal: controller.signal }).then(json => {
      if (controller.signal.aborted) return;
      const seen = new Set();
      setQueries((Array.isArray(json.data) ? json.data : []).filter(query => {
        if (typeof query !== "string" || !query.trim() || query.length > 100) return false;
        const key = query.trim().toLocaleLowerCase();
        if (seen.has(key)) return false;
        seen.add(key); return true;
      }).slice(0, 10));
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [retry]);
  const remove = async (term) => {
    const controller = controllerRef.current;
    if (removing || !controller || controller.signal.aborted) return;
    setRemoving(term);
    try {
      await requestJson("/api/searches", { method: "DELETE", body: { term }, signal: controller.signal });
      if (!controller.signal.aborted) setQueries(current => current.filter(query => query !== term));
    } catch { if (!controller.signal.aborted) setError(true); }
    finally { if (!controller.signal.aborted) setRemoving(""); }
  };
  if (!queries.length && !error) return null;
  return <section aria-label="Recent searches">
    <header className={styles.sectionHead}><h2>Recent searches</h2></header>
    {error && <UserMessage compact title="Recent searches unavailable" message="Your recent search change couldn’t be loaded or saved. Please try again." onRetry={() => setRetry(value => value + 1)} />}
    <div className={styles.recentGrid}>{queries.map(query => <article key={query} className={styles.recentCard}>
      <Link href={`/search/${encodeURIComponent(query)}`}><span className={styles.recentIcon} aria-hidden="true"><FiClock /></span><strong title={query}>{query}</strong><small>Recent search</small></Link>
      <button type="button" aria-label={`Remove recent search ${query}`} disabled={Boolean(removing)} onClick={() => void remove(query)}><FiX aria-hidden="true" /></button>
    </article>)}</div>
  </section>;
}
