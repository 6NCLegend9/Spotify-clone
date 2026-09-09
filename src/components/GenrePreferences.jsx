"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import {
  FiAlertCircle,
  FiArrowLeft,
  FiCheck,
  FiChevronRight,
  FiHeadphones,
  FiLoader,
  FiLock,
  FiPlus,
  FiSearch,
  FiTrash2,
  FiX,
} from "react-icons/fi";
import AuthMessage from "@/components/AuthMessage";
import { normalizeGenreName } from "@/utils/genreTaxonomy";
import { requestJson } from "@/services/http";
import { userErrorDetails } from "@/utils/userError";

const MAX_SELECTED_GENRES = 12;
const MAX_PERSONAL_GENRES = 40;
const SAVED_STATUS_DURATION = 2200;

const CATEGORY_TONES = [
  "from-cyan-400/25 via-cyan-400/10 to-transparent",
  "from-violet-400/25 via-violet-400/10 to-transparent",
  "from-fuchsia-400/25 via-fuchsia-400/10 to-transparent",
  "from-amber-400/25 via-amber-400/10 to-transparent",
  "from-emerald-400/25 via-emerald-400/10 to-transparent",
  "from-rose-400/25 via-rose-400/10 to-transparent",
];

function genreKey(value) {
  return normalizeGenreName(value);
}

function itemNames(item) {
  return [item?.defaultName, item?.name, ...(item?.aliases || [])].filter(Boolean);
}

function genreMatchesValue(item, value) {
  const valueKey = genreKey(value);
  return Boolean(valueKey) && itemNames(item).some((name) => genreKey(name) === valueKey);
}

function isGenreSelected(selected, item) {
  return selected.some((value) => genreMatchesValue(item, value));
}

function sameGenreList(first, second) {
  return first.length === second.length
    && first.every((value, index) => genreKey(value) === genreKey(second[index]));
}

function toneForGenre(item, index = 0) {
  const source = genreKey(item?.defaultName || item?.name);
  const hash = Array.from(source).reduce((total, character) => total + character.charCodeAt(0), index);
  return CATEGORY_TONES[hash % CATEGORY_TONES.length];
}

function safeErrorMessage(error, fallbackMessage) {
  const details = userErrorDetails(error);
  const sharedMessageCodes = new Set([
    "OFFLINE",
    "NETWORK_ERROR",
    "TIMEOUT",
    "RATE_LIMITED",
    "UNAVAILABLE",
    "UNAUTHORIZED",
  ]);
  return sharedMessageCodes.has(details.code)
    ? userErrorDetails({ code: details.code }).message
    : fallbackMessage;
}

function GenreChoice({ item, selected, parentName, onToggle, disabled = false }) {
  const name = item.name || item.defaultName;
  const isPersonal = item.scope === "personal";

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onToggle(item)}
      disabled={disabled}
      className={`group flex min-h-11 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition duration-200 ease-out active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 ${
        selected
          ? "border-[#00e6e6]/70 bg-[#00e6e6]/10 text-white shadow-[0_0_16px_rgba(0,230,230,0.08)]"
          : "border-white/10 bg-white/[0.035] text-white hover:border-white/25 hover:bg-white/[0.06]"
      }`}
    >
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold leading-5">{name}</span>
        <span className="mt-0.5 block truncate text-[10px] leading-4 text-[#9aa8b5]">
          {isPersonal ? "Custom genre" : parentName || "Main genre"}
        </span>
      </span>
      <span
        aria-hidden="true"
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs transition ${
          selected
            ? "border-[#00e6e6] bg-[#00e6e6] text-[#001014]"
            : "border-white/15 text-white/70 group-hover:border-[#00e6e6]/60 group-hover:text-[#00e6e6]"
        }`}
      >
        {selected ? <FiCheck aria-hidden="true" /> : <FiPlus aria-hidden="true" />}
      </span>
    </button>
  );
}

function CategoryCard({ item, index, selected, onBrowse, onToggle }) {
  const name = item.name || item.defaultName;
  const childCount = item.children?.length || 0;

  return (
    <article
      className={`relative overflow-hidden rounded-xl border bg-gradient-to-br ${toneForGenre(item, index)} bg-[#091522] transition duration-200 ease-out hover:border-white/25 ${
        selected ? "border-[#00e6e6]/55" : "border-white/10"
      }`}
    >
      <div className="flex items-start gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => onBrowse(item.id)}
          className="min-w-0 flex-1 text-left"
          aria-label={`Browse ${name} and ${childCount} subgenres`}
        >
          <span className="text-[10px] font-semibold tabular-nums tracking-[0.16em] text-white/45">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="mt-1 block truncate text-[13px] font-semibold leading-5 text-white">
            {name}
          </span>
          <span className="mt-0.5 flex items-center gap-0.5 text-[10px] leading-4 text-white/55">
            {childCount} subgenres
            <FiChevronRight className="h-3 w-3" aria-hidden="true" />
          </span>
        </button>
        <button
          type="button"
          aria-pressed={selected}
          aria-label={`${selected ? "Remove" : "Add"} ${name} ${selected ? "from" : "to"} your picks`}
          onClick={() => onToggle(item)}
          className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs transition ${
            selected
              ? "border-[#00e6e6] bg-[#00e6e6] text-[#001014]"
              : "border-white/20 bg-black/20 text-white hover:border-[#00e6e6] hover:text-[#00e6e6]"
          }`}
        >
          {selected ? <FiCheck aria-hidden="true" /> : <FiPlus aria-hidden="true" />}
        </button>
      </div>
    </article>
  );
}

function GenreSkeleton() {
  return (
    <div aria-label="Loading music taste preferences" aria-busy="true" className="space-y-5">
      <div className="h-24 animate-pulse rounded-2xl bg-white/[0.05]" />
      <div className="h-11 max-w-2xl animate-pulse rounded-xl bg-white/[0.05]" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }, (_, index) => (
          <div key={index} className="h-[4.5rem] animate-pulse rounded-xl bg-white/[0.05]" />
        ))}
      </div>
    </div>
  );
}

function CustomGenreDialog({
  open,
  name,
  parentId,
  roots,
  personalCount,
  loading,
  error,
  onNameChange,
  onParentChange,
  onClose,
  onSubmit,
}) {
  const panelRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => inputRef.current?.focus());

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !loading) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = panelRef.current?.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [loading, onClose, open]);

  if (!open) return null;

  const trimmedName = name.trim();
  const nameIsValid = trimmedName.length >= 2 && trimmedName.length <= 80;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="custom-genre-title"
        aria-describedby="custom-genre-description"
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[28px] border border-white/10 bg-[#07121d] p-5 shadow-2xl sm:max-w-lg sm:rounded-[24px] sm:p-7"
      >
        <div className="mx-auto mb-5 h-1 w-12 rounded-full bg-white/20 sm:hidden" aria-hidden="true" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow mb-2">Make it yours</p>
            <h3 id="custom-genre-title" className="text-xl font-bold text-white">
              Create a custom genre
            </h3>
            <p id="custom-genre-description" className="mt-2 text-sm leading-6 text-[#9aa8b5]">
              Add a sound that is specific to your taste. We will use it when shaping recommendations.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="icon-btn h-11 w-11 shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Close custom genre dialog"
          >
            <FiX aria-hidden="true" />
          </button>
        </div>

        {error ? (
          <div className="mt-5">
            <AuthMessage title="Could not add this genre" message={error} />
          </div>
        ) : null}

        <form className="mt-6 space-y-5" onSubmit={onSubmit}>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[#9aa8b5]">
              Genre name
            </span>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              maxLength={80}
              autoComplete="off"
              placeholder="e.g. Midnight Afro-house"
              className="field"
              aria-describedby="custom-genre-name-help"
            />
            <span id="custom-genre-name-help" className="mt-2 flex justify-between gap-3 text-[11px] text-[#9aa8b5]">
              <span>Existing genres will be matched automatically.</span>
              <span>{name.length}/80</span>
            </span>
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[#9aa8b5]">
              Related category <span className="normal-case tracking-normal text-[#748493]">(optional)</span>
            </span>
            <select
              value={parentId}
              onChange={(event) => onParentChange(event.target.value)}
              className="field appearance-none"
            >
              <option value="">No category</option>
              {roots.map((root) => (
                <option key={root.id} value={root.id}>
                  {root.name || root.defaultName}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 text-xs text-[#9aa8b5]">
            You have created <span className="font-semibold text-white">{personalCount}</span> of{" "}
            {MAX_PERSONAL_GENRES} custom genres.
          </div>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="btn-ghost disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!nameIsValid || loading}
              className="btn-primary min-w-40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? <span className="custom-loader" aria-hidden="true" /> : <FiPlus aria-hidden="true" />}
              {loading ? "Creating" : "Create & select"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

let genrePrefsCache = null;

export default function GenrePreferences({ status }) {
  const [selectedGenres, setSelectedGenres] = useState(() => genrePrefsCache?.selected ?? []);
  const [catalog, setCatalog] = useState(() => genrePrefsCache?.catalog ?? []);
  const [genreTree, setGenreTree] = useState(() => genrePrefsCache?.tree ?? []);
  const [personalGenres, setPersonalGenres] = useState(() => genrePrefsCache?.personal ?? []);
  const [query, setQuery] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const [initialLoading, setInitialLoading] = useState(status === "authenticated" && !genrePrefsCache);
  const [loadError, setLoadError] = useState("");
  const [interactionError, setInteractionError] = useState("");
  const [saveState, setSaveState] = useState("idle");
  const [loadAttempt, setLoadAttempt] = useState(0);

  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customParentId, setCustomParentId] = useState("");
  const [customLoading, setCustomLoading] = useState(false);
  const [customError, setCustomError] = useState("");
  const [deleteCandidateId, setDeleteCandidateId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const mountedRef = useRef(true);
  const selectedRef = useRef([]);
  const persistedRef = useRef([]);
  const failedSelectionRef = useRef(null);
  const saveLoopRef = useRef(false);
  const savedTimerRef = useRef(null);
  const customOpenerRef = useRef(null);

  const roots = useMemo(() => {
    if (genreTree.length > 0) return genreTree;
    return catalog
      .filter((item) => item.scope === "system" && !item.parentId)
      .map((root) => ({
        ...root,
        children: catalog.filter((item) => item.parentId === root.id),
      }));
  }, [catalog, genreTree]);

  const activeCategory = useMemo(
    () => roots.find((item) => item.id === activeCategoryId) || null,
    [activeCategoryId, roots],
  );

  const parentNames = useMemo(
    () => new Map(catalog.map((item) => [item.id, item.name || item.defaultName])),
    [catalog],
  );

  const searchResults = useMemo(() => {
    const normalizedQuery = genreKey(query);
    if (!normalizedQuery) return [];

    return catalog
      .map((item) => {
        const keys = itemNames(item).map(genreKey);
        const exact = keys.some((key) => key === normalizedQuery);
        const startsWith = keys.some((key) => key.startsWith(normalizedQuery));
        const includes = keys.some((key) => key.includes(normalizedQuery));
        return { item, score: exact ? 0 : startsWith ? 1 : includes ? 2 : 3 };
      })
      .filter(({ score }) => score < 3)
      .sort((first, second) => {
        if (first.score !== second.score) return first.score - second.score;
        if (first.item.scope !== second.item.scope) return first.item.scope === "personal" ? -1 : 1;
        return (first.item.name || first.item.defaultName).localeCompare(
          second.item.name || second.item.defaultName,
        );
      })
      .slice(0, 40)
      .map(({ item }) => item);
  }, [catalog, query]);

  const selectedItems = useMemo(
    () => selectedGenres.map((name) => (
      catalog.find((item) => genreMatchesValue(item, name))
      || { id: name, name, defaultName: name, aliases: [], scope: "unknown" }
    )),
    [catalog, selectedGenres],
  );

  const announceSaved = useCallback(() => {
    if (!mountedRef.current) return;
    if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
    setSaveState("saved");
    savedTimerRef.current = window.setTimeout(() => {
      if (mountedRef.current) setSaveState("idle");
    }, SAVED_STATUS_DURATION);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (status !== "authenticated") {
      genrePrefsCache = null;
      setInitialLoading(false);
      return undefined;
    }

    let cancelled = false;
    if (!genrePrefsCache) setInitialLoading(true);
    setLoadError("");
    setInteractionError("");

    const loadGenres = async () => {
      try {
        const [settingsData, catalogData] = await Promise.all([
          requestJson("/api/settings", {
            fallbackMessage: "Your saved music taste could not be loaded.",
          }),
          requestJson("/api/genres", {
            fallbackMessage: "Genre options are unavailable right now.",
          }),
        ]);
        if (!Array.isArray(settingsData?.genres) || !Array.isArray(catalogData?.genres)) {
          throw new Error("Genre preferences did not return usable data.");
        }
        if (cancelled) return;

        const loadedSelection = Array.isArray(settingsData?.genres) ? settingsData.genres : [];
        const loadedCatalog = Array.isArray(catalogData?.genres) ? catalogData.genres : [];
        selectedRef.current = loadedSelection;
        persistedRef.current = loadedSelection;
        failedSelectionRef.current = null;
        setSelectedGenres(loadedSelection);
        setCatalog(loadedCatalog);
        setGenreTree(Array.isArray(catalogData?.tree) ? catalogData.tree : []);
        setPersonalGenres(Array.isArray(catalogData?.personalGenres) ? catalogData.personalGenres : []);
        setSaveState("idle");
        genrePrefsCache = {
          selected: loadedSelection,
          catalog: loadedCatalog,
          tree: Array.isArray(catalogData?.tree) ? catalogData.tree : [],
          personal: Array.isArray(catalogData?.personalGenres) ? catalogData.personalGenres : [],
        };
      } catch (error) {
        if (!cancelled) {
          setLoadError(safeErrorMessage(error, "Genre options are unavailable right now."));
        }
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    };

    loadGenres();
    return () => {
      cancelled = true;
    };
  }, [loadAttempt, status]);

  const persistLatestSelection = useCallback(async () => {
    if (saveLoopRef.current || status !== "authenticated") return;
    saveLoopRef.current = true;
    let failed = false;

    if (mountedRef.current) setSaveState("saving");

    while (
      mountedRef.current
      && !sameGenreList(persistedRef.current, selectedRef.current)
    ) {
      const snapshot = [...selectedRef.current];
      try {
        const data = await requestJson("/api/recommendations", {
          method: "POST",
          body: { genres: snapshot },
          fallbackMessage: "Your music taste could not be saved.",
        });
        if (!Array.isArray(data?.profile?.genres)) {
          throw new Error("Genre preferences did not return usable data.");
        }
        const canonicalSelection = data.profile.genres;

        persistedRef.current = canonicalSelection;
        failedSelectionRef.current = null;
        if (sameGenreList(selectedRef.current, snapshot)) {
          selectedRef.current = canonicalSelection;
          if (mountedRef.current) setSelectedGenres(canonicalSelection);
        }
        if (mountedRef.current) setInteractionError("");
      } catch (error) {
        failedSelectionRef.current = snapshot;
        const rollback = [...persistedRef.current];
        selectedRef.current = rollback;
        if (mountedRef.current) {
          setSelectedGenres(rollback);
          setInteractionError(safeErrorMessage(error, "Your music taste could not be saved."));
          setSaveState("error");
        }
        failed = true;
        break;
      }
    }

    saveLoopRef.current = false;
    if (!failed && mountedRef.current) announceSaved();
  }, [announceSaved, status]);

  const updateSelection = useCallback((nextSelection) => {
    selectedRef.current = nextSelection;
    failedSelectionRef.current = null;
    setSelectedGenres(nextSelection);
    setInteractionError("");
    setSaveState("saving");
    void persistLatestSelection();
  }, [persistLatestSelection]);

  const toggleGenre = useCallback((item) => {
    const current = selectedRef.current;
    const selected = isGenreSelected(current, item);

    if (!selected && current.length >= MAX_SELECTED_GENRES) {
      setInteractionError(`You can choose up to ${MAX_SELECTED_GENRES} genres. Remove one to add another.`);
      return false;
    }

    const next = selected
      ? current.filter((value) => !genreMatchesValue(item, value))
      : [...current, item.defaultName || item.name];
    updateSelection(next);
    return true;
  }, [updateSelection]);

  const ensureGenreSelected = useCallback((item) => {
    if (isGenreSelected(selectedRef.current, item)) return true;
    return toggleGenre(item);
  }, [toggleGenre]);

  const retrySave = useCallback(() => {
    const failedSelection = failedSelectionRef.current;
    if (!failedSelection) return;
    selectedRef.current = failedSelection;
    setSelectedGenres(failedSelection);
    setInteractionError("");
    setSaveState("saving");
    void persistLatestSelection();
  }, [persistLatestSelection]);

  const restoreCustomOpener = useCallback(() => {
    window.requestAnimationFrame(() => customOpenerRef.current?.focus?.());
  }, []);

  const openCustomDialog = useCallback((prefill = "") => {
    customOpenerRef.current = document.activeElement;
    setCustomName(prefill);
    setCustomParentId(activeCategory?.id || "");
    setCustomError("");
    setCustomDialogOpen(true);
  }, [activeCategory]);

  const closeCustomDialog = useCallback(() => {
    if (customLoading) return;
    setCustomDialogOpen(false);
    setCustomError("");
    restoreCustomOpener();
  }, [customLoading, restoreCustomOpener]);

  const handleCreateCustomGenre = async (event) => {
    event.preventDefault();
    const name = customName.trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 80) {
      setCustomError("Use a name between 2 and 80 characters.");
      return;
    }

    setCustomLoading(true);
    setCustomError("");
    try {
      const data = await requestJson("/api/genres", {
        method: "POST",
        body: {
          name,
          ...(customParentId ? { parentId: customParentId } : {}),
        },
        fallbackMessage: "That genre could not be created.",
      });
      if (!data?.genre) throw new Error("That genre could not be created.");

      const genre = data.genre;
      setCatalog((current) => (
        current.some((item) => item.id === genre.id) ? current : [...current, genre]
      ));
      if (genre.scope === "personal") {
        setPersonalGenres((current) => (
          current.some((item) => item.id === genre.id) ? current : [...current, genre]
        ));
      }

      const wasSelected = isGenreSelected(selectedRef.current, genre);
      const addedToSelection = ensureGenreSelected(genre);
      setCustomDialogOpen(false);
      setCustomName("");
      setCustomParentId("");
      setQuery("");
      restoreCustomOpener();

      if (!addedToSelection) {
        toast.success(data.created ? "Custom genre created. Remove a pick to select it." : "Genre found.");
      } else if (wasSelected) {
        toast.success("That genre is already in your picks.");
      } else {
        toast.success(data.created ? "Custom genre created and selected." : "Genre added to your picks.");
      }
    } catch (error) {
      setCustomError(safeErrorMessage(error, "That genre could not be created."));
    } finally {
      setCustomLoading(false);
    }
  };

  const handleDeletePersonalGenre = async (genre) => {
    if (saveState === "saving") {
      setInteractionError("Wait for your current changes to finish saving before deleting a custom genre.");
      return;
    }

    setDeletingId(genre.id);
    setInteractionError("");
    try {
      const data = await requestJson(`/api/genres?id=${encodeURIComponent(genre.id)}`, {
        method: "DELETE",
        fallbackMessage: "That custom genre could not be deleted.",
      });
      if (data?.success !== true) throw new Error("Genre deletion did not complete.");

      const removedIds = new Set([genre.id]);
      let foundDescendant = true;
      while (foundDescendant) {
        foundDescendant = false;
        personalGenres.forEach((item) => {
          if (!removedIds.has(item.id) && removedIds.has(item.parentId)) {
            removedIds.add(item.id);
            foundDescendant = true;
          }
        });
      }
      const removedItems = personalGenres.filter((item) => removedIds.has(item.id));
      const keepGenre = (value) => !removedItems.some((item) => genreMatchesValue(item, value));
      const nextSelection = selectedRef.current.filter(keepGenre);

      selectedRef.current = nextSelection;
      persistedRef.current = persistedRef.current.filter(keepGenre);
      failedSelectionRef.current = null;
      setSelectedGenres(nextSelection);
      setCatalog((current) => current.filter((item) => !removedIds.has(item.id)));
      setPersonalGenres((current) => current.filter((item) => !removedIds.has(item.id)));
      setDeleteCandidateId(null);
      announceSaved();
      toast.success("Custom genre deleted.");
    } catch (error) {
      setInteractionError(safeErrorMessage(error, "That custom genre could not be deleted."));
    } finally {
      setDeletingId(null);
    }
  };

  const searchIsActive = Boolean(query.trim());
  const selectedCount = selectedGenres.length;
  const saveStatus = {
    idle: { icon: null, text: "Changes save automatically", className: "text-[#748493]" },
    saving: { icon: <FiLoader className="animate-spin" aria-hidden="true" />, text: "Saving", className: "text-[#9aa8b5]" },
    saved: { icon: <FiCheck aria-hidden="true" />, text: "Saved", className: "text-[#00e6e6]" },
    error: { icon: <FiAlertCircle aria-hidden="true" />, text: "Not saved", className: "text-amber-300" },
  }[saveState];

  return (
    <section
      aria-labelledby="music-taste-title"
      className="mb-8 overflow-hidden rounded-[22px] border border-white/10 bg-[#07121d]/75 shadow-[0_24px_80px_rgba(0,0,0,0.18)]"
    >
      <div className="relative overflow-hidden border-b border-white/10 p-5 sm:p-7">
        <div
          className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-[#00e6e6]/10 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div className="flex items-start gap-4">
            <span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-[#00e6e6]/25 bg-[#00e6e6]/10 text-[#00e6e6]"
              aria-hidden="true"
            >
              <FiHeadphones className="h-5 w-5" />
            </span>
            <div>
              <p className="eyebrow mb-2">Discovery</p>
              <h2 id="music-taste-title" className="text-xl font-bold text-white sm:text-2xl">
                Shape your music taste
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#9aa8b5]">
                Pick the sounds you love. We use them to tune your homepage while your listening history grows.
              </p>
            </div>
          </div>
          {status === "authenticated" ? (
            <div className="flex shrink-0 items-center justify-between gap-5 rounded-2xl border border-white/10 bg-black/15 px-4 py-3 sm:block sm:text-right">
              <p className="text-sm font-semibold text-white" aria-live="polite">
                <span className="text-[#00e6e6]">{selectedCount}</span> / {MAX_SELECTED_GENRES} selected
              </p>
              <p
                role="status"
                aria-live="polite"
                className={`mt-1 flex items-center gap-1.5 text-[11px] sm:justify-end ${saveStatus.className}`}
              >
                {saveStatus.icon}
                {saveStatus.text}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="p-5 sm:p-7">
        {status === "loading" || initialLoading ? (
          <GenreSkeleton />
        ) : status !== "authenticated" ? (
          <div className="flex flex-col items-start justify-between gap-5 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:flex-row sm:items-center sm:p-6">
            <div className="flex items-start gap-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/[0.06] text-[#9aa8b5]">
                <FiLock aria-hidden="true" />
              </span>
              <div>
                <h3 className="font-semibold text-white">Sign in to personalize discovery</h3>
                <p className="mt-1 text-sm text-[#9aa8b5]">
                  Guests hear popular music. Sign in to save genres and get recommendations based on your taste.
                </p>
              </div>
            </div>
            <Link href="/login" className="btn-primary shrink-0">
              Sign in
            </Link>
          </div>
        ) : loadError ? (
          <AuthMessage
            title="Music taste is unavailable"
            message={loadError}
            onRetry={() => setLoadAttempt((attempt) => attempt + 1)}
          />
        ) : (
          <div className="space-y-7">
            <div className="rounded-2xl border border-white/10 bg-black/15 p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-white">Your picks</h3>
                  <p className="mt-0.5 text-[11px] text-[#748493]">Choose broad genres or get specific with subgenres.</p>
                </div>
                {selectedCount > 0 ? (
                  <span className="shrink-0 text-[11px] font-semibold text-[#00e6e6]">{selectedCount} saved</span>
                ) : null}
              </div>
              {selectedItems.length > 0 ? (
                <div className="flex flex-wrap gap-2" aria-label="Selected music genres">
                  {selectedItems.map((item) => {
                    const name = item.name || item.defaultName;
                    return (
                      <button
                        key={`${item.id}-${name}`}
                        type="button"
                        onClick={() => toggleGenre(item)}
                        className="group inline-flex items-center gap-1.5 rounded-full border border-[#00e6e6]/50 bg-[#00e6e6]/10 px-3 py-2 text-xs font-medium text-[#bdfbff] transition hover:border-[#00e6e6] hover:bg-[#00e6e6]/15"
                        aria-label={`Remove ${name} from your picks`}
                      >
                        {name}
                        <FiX className="text-[#00e6e6]" aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-center text-sm text-[#748493]">
                  Your taste profile is ready for its first pick.
                </p>
              )}
            </div>

            {interactionError ? (
              <AuthMessage
                title={saveState === "error" ? "Changes were not saved" : "Check your selection"}
                message={interactionError}
                onRetry={saveState === "error" && failedSelectionRef.current ? retrySave : undefined}
                retryLabel="Retry save"
              />
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Search genres, subgenres, and custom genres</span>
                <FiSearch
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#748493]"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActiveCategoryId(null);
                  }}
                  placeholder='Search "Afrobeats", "Indie Pop", or your own sound'
                  className="field h-12 rounded-2xl pl-11 pr-11"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-[#9aa8b5] hover:bg-white/10 hover:text-white"
                    aria-label="Clear genre search"
                  >
                    <FiX aria-hidden="true" />
                  </button>
                ) : null}
              </label>
              <button
                type="button"
                onClick={() => openCustomDialog(query.trim())}
                className="btn-ghost h-12 shrink-0 px-4 text-sm"
              >
                <FiPlus aria-hidden="true" /> Create custom
              </button>
            </div>

            {searchIsActive ? (
              <div>
                <div className="mb-4 flex items-end justify-between gap-4">
                  <div>
                    <p className="eyebrow mb-2">Search results</p>
                    <h3 className="text-lg font-semibold text-white">
                      {searchResults.length > 0
                        ? `${searchResults.length} ${searchResults.length === 1 ? "match" : "matches"}`
                        : "No matching genres"}
                    </h3>
                  </div>
                </div>
                {searchResults.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {searchResults.map((item) => (
                      <GenreChoice
                        key={item.id}
                        item={item}
                        selected={isGenreSelected(selectedGenres, item)}
                        parentName={parentNames.get(item.parentId)}
                        onToggle={toggleGenre}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.025] p-6 text-center">
                    <p className="text-sm font-medium text-white">Make “{query.trim()}” part of your taste.</p>
                    <p className="mt-1 text-xs text-[#9aa8b5]">Create it as a custom genre and we will add it to your picks.</p>
                    <button
                      type="button"
                      onClick={() => openCustomDialog(query.trim())}
                      className="btn-primary mt-4 h-10 px-4 text-xs"
                    >
                      <FiPlus aria-hidden="true" /> Create “{query.trim()}”
                    </button>
                  </div>
                )}
              </div>
            ) : activeCategory ? (
              <div>
                <button
                  type="button"
                  onClick={() => setActiveCategoryId(null)}
                  className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-[#9aa8b5] transition hover:text-white"
                >
                  <FiArrowLeft aria-hidden="true" /> All categories
                </button>
                <div className="mb-5">
                  <p className="eyebrow mb-2">Explore the sound</p>
                  <h3 className="text-2xl font-bold text-white">{activeCategory.name || activeCategory.defaultName}</h3>
                  <p className="mt-2 text-sm text-[#9aa8b5]">
                    Pick the main genre or refine your taste with its subgenres.
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <GenreChoice
                    item={activeCategory}
                    selected={isGenreSelected(selectedGenres, activeCategory)}
                    onToggle={toggleGenre}
                  />
                  {(activeCategory.children || []).map((item) => (
                    <GenreChoice
                      key={item.id}
                      item={item}
                      selected={isGenreSelected(selectedGenres, item)}
                      parentName={activeCategory.name || activeCategory.defaultName}
                      onToggle={toggleGenre}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-4">
                  <p className="eyebrow mb-2">Browse categories</p>
                  <h3 className="text-lg font-semibold text-white">Find the sounds that feel like you</h3>
                  <p className="mt-1 text-xs text-[#9aa8b5]">Open a category to discover more specific styles.</p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {roots.map((item, index) => (
                    <CategoryCard
                      key={item.id}
                      item={item}
                      index={index}
                      selected={isGenreSelected(selectedGenres, item)}
                      onBrowse={setActiveCategoryId}
                      onToggle={toggleGenre}
                    />
                  ))}
                </div>
              </div>
            )}

            {personalGenres.length > 0 ? (
              <div className="border-t border-white/10 pt-7">
                <div className="mb-4">
                  <p className="eyebrow mb-2">Created by you</p>
                  <h3 className="text-lg font-semibold text-white">Your custom genres</h3>
                  <p className="mt-1 text-xs text-[#9aa8b5]">Select them like any other genre, or permanently remove ones you no longer use.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {personalGenres.map((item) => {
                    const selected = isGenreSelected(selectedGenres, item);
                    const confirmingDelete = deleteCandidateId === item.id;
                    const name = item.name || item.defaultName;
                    return (
                      <div
                        key={item.id}
                        className={`rounded-2xl border p-3 ${
                          confirmingDelete ? "border-red-400/35 bg-red-400/[0.06]" : "border-white/10 bg-white/[0.025]"
                        }`}
                      >
                        {confirmingDelete ? (
                          <div role="alertdialog" aria-labelledby={`delete-${item.id}-title`}>
                            <p id={`delete-${item.id}-title`} className="text-sm font-semibold text-white">
                              Delete “{name}”?
                            </p>
                            <p className="mt-1 text-xs leading-5 text-[#9aa8b5]">
                              This removes it from your custom catalog and your picks.
                            </p>
                            <div className="mt-3 flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleDeletePersonalGenre(item)}
                                disabled={deletingId === item.id}
                                className="inline-flex h-9 items-center gap-2 rounded-full bg-red-500 px-3 text-xs font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {deletingId === item.id
                                  ? <FiLoader className="animate-spin" aria-hidden="true" />
                                  : <FiTrash2 aria-hidden="true" />}
                                Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteCandidateId(null)}
                                disabled={deletingId === item.id}
                                className="btn-ghost h-9 px-3 text-xs disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              aria-pressed={selected}
                              onClick={() => toggleGenre(item)}
                              className="min-w-0 flex-1 rounded-xl px-2 py-1.5 text-left transition hover:bg-white/[0.04]"
                            >
                              <span className="block truncate text-sm font-semibold text-white">{name}</span>
                              <span className={`mt-1 block text-[11px] ${selected ? "text-[#00e6e6]" : "text-[#748493]"}`}>
                                {selected ? "In your picks" : "Tap to add"}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteCandidateId(item.id)}
                              disabled={saveState === "saving"}
                              className="icon-btn h-9 w-9 shrink-0 text-[#9aa8b5] hover:border-red-400/50 hover:bg-red-400/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                              aria-label={`Delete custom genre ${name}`}
                            >
                              <FiTrash2 aria-hidden="true" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <CustomGenreDialog
        open={customDialogOpen}
        name={customName}
        parentId={customParentId}
        roots={roots}
        personalCount={personalGenres.length}
        loading={customLoading}
        error={customError}
        onNameChange={setCustomName}
        onParentChange={setCustomParentId}
        onClose={closeCustomDialog}
        onSubmit={handleCreateCustomGenre}
      />
    </section>
  );
}
