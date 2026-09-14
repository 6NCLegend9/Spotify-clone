"use client";

import { useState } from "react";
import { FiGrid, FiList, FiSearch } from "react-icons/fi";
import styles from "./libraryList.module.css";

export default function LibraryList({ playlists, children }) {
  const [query, setQuery] = useState("");
  const [grid, setGrid] = useState(false);
  const matches = playlists.filter((playlist) => String(playlist.name || "").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <section className={styles.library} aria-label="Your playlists">
    <div className={styles.toolbar}>
      <label className={styles.search}><FiSearch aria-hidden="true" /><span className="sr-only">Filter your library</span><input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Filter your library..." /></label>
      <button type="button" onClick={() => setGrid((value) => !value)} aria-pressed={grid} aria-label={grid ? "Use list view" : "Use grid view"} className={styles.toggle}>{grid ? <FiList /> : <FiGrid />}</button>
    </div>
    <div className={styles.items} data-view={grid ? "grid" : "list"}>{matches.map(children)}</div>
    {!matches.length && playlists.length > 0 && <p className={styles.empty} role="status">No playlists match your search.</p>}
  </section>;
}
