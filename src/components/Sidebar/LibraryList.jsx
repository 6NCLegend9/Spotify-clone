"use client";

import { useState } from "react";
import { FiGrid, FiList, FiSearch } from "react-icons/fi";
import styles from "./libraryList.module.css";
import useLibraryPresentation from "@/hooks/useLibraryPresentation";
import { LIBRARY_SORTS, sortLibraryItems } from "@/utils/libraryPresentation.mjs";

export default function LibraryList({ playlists, owner, children }) {
  const [query, setQuery] = useState("");
  const { sort, view, setSort, setView } = useLibraryPresentation(owner, "sidebar");
  const grid = view === "grid";
  const matches = sortLibraryItems(playlists.filter((playlist) => `${playlist.name || ""} ${playlist.user?.userName || ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), sort);
  return <section className={styles.library} aria-label="Your playlists">
    <div className={styles.toolbar}>
      <label className={styles.search}><FiSearch aria-hidden="true" /><span className="sr-only">Filter your library</span><input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Filter your library..." /></label>
      <button type="button" onClick={() => setView(grid ? "list" : "grid")} aria-pressed={grid} aria-label={grid ? "Use list view" : "Use grid view"} className={styles.toggle}>{grid ? <FiList /> : <FiGrid />}</button>
    </div>
    <label className={styles.sort}><span className="sr-only">Sort sidebar library</span><select value={sort} onChange={(event) => setSort(event.target.value)}>{LIBRARY_SORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <div className={styles.items} data-view={grid ? "grid" : "list"}>{matches.map(children)}</div>
    {!matches.length && playlists.length > 0 && <p className={styles.empty} role="status">No playlists match your search.</p>}
  </section>;
}
