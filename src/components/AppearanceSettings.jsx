"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { shallowEqual, useDispatch, useSelector } from "react-redux";
import toast from "react-hot-toast";
import {
  clearAppearancePreview,
  hydrateAppearance,
  previewAppearance,
} from "@/redux/features/appearanceSlice";
import { getHeyKasaDesktopApi } from "@/utils/desktopEnvironment";

function clone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : null;
}

function foregroundFor(hex) {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ""));
  if (!match) return "#001014";
  const [red, green, blue] = match.slice(1).map((value) => Number.parseInt(value, 16));
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance >= 0.56 ? "#001014" : "#ffffff";
}

function missingCopy(warning) {
  const fileName = typeof warning?.fileName === "string" && warning.fileName.trim()
    ? warning.fileName.trim()
    : "background image";
  return `Couldn’t find “${fileName}”. Choose it again or use the default background.`;
}

function RangeControl({ label, value, min, max, step = 1, suffix = "", onChange }) {
  return (
    <label className="block text-sm text-[var(--muted)]">
      <span className="flex items-center justify-between gap-3">
        <span>{label}</span>
        <span className="tabular-nums text-[var(--text)]">{value}{suffix}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 h-8 w-full accent-[var(--accent)]"
      />
    </label>
  );
}

export default function AppearanceSettings() {
  const dispatch = useDispatch();
  const appearance = useSelector((state) => ({
    available: state.appearance.available,
    profiles: state.appearance.profiles,
    activeProfile: state.appearance.activeProfile,
    activeProfileId: state.appearance.activeProfileId,
    backgroundUrl: state.appearance.backgroundUrl,
    warning: state.appearance.warning,
    resolvedAccent: state.appearance.resolvedAccent,
  }), shallowEqual);
  const api = typeof window !== "undefined" ? getHeyKasaDesktopApi()?.appearance : null;
  const [draft, setDraft] = useState(null);
  const [draftBackgroundUrl, setDraftBackgroundUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [dirty, setDirty] = useState(false);
  const importedAssetRef = useRef("");

  const profiles = appearance?.profiles || [];
  const activeProfile = appearance?.activeProfile || null;
  const available = appearance?.available === true && Boolean(api);

  useEffect(() => {
    if (!activeProfile || dirty) return;
    setDraft(clone(activeProfile));
    setDraftBackgroundUrl(appearance.backgroundUrl || "");
  }, [activeProfile, appearance?.backgroundUrl, dirty]);

  useEffect(() => () => {
    dispatch(clearAppearancePreview());
    const assetId = importedAssetRef.current;
    if (assetId && api?.discardBackground) void api.discardBackground(assetId).catch(() => {});
  }, [api, dispatch]);

  const previewAccent = useMemo(() => {
    if (draft?.accent?.mode === "fixed") return draft.accent.fixedColor;
    return appearance?.resolvedAccent || draft?.accent?.fixedColor || "#00e6e6";
  }, [appearance?.resolvedAccent, draft?.accent]);

  useEffect(() => {
    if (!dirty || !draft) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const accent = draft.accent?.mode === "fixed"
        ? draft.accent.fixedColor
        : appearance?.resolvedAccent;
      dispatch(previewAppearance({
        profile: draft,
        backgroundUrl: draftBackgroundUrl,
        resolvedAccent: accent,
        accentForeground: foregroundFor(accent),
      }));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [appearance?.resolvedAccent, dirty, dispatch, draft, draftBackgroundUrl]);

  const updateDraft = (producer) => {
    setDraft((current) => {
      if (!current) return current;
      const next = clone(current);
      producer(next);
      return next;
    });
    setDirty(true);
  };

  const discardImported = async () => {
    const assetId = importedAssetRef.current;
    importedAssetRef.current = "";
    if (assetId && api?.discardBackground) {
      await api.discardBackground(assetId).catch(() => {});
    }
  };

  const cancel = async () => {
    await discardImported();
    setDraft(clone(activeProfile));
    setDraftBackgroundUrl(appearance.backgroundUrl || "");
    setDirty(false);
    dispatch(clearAppearancePreview());
  };

  const applyPayload = (payload) => {
    if (payload && typeof payload === "object") dispatch(hydrateAppearance(payload));
  };

  const save = async () => {
    if (!draft || !api?.saveProfile || busy) return;
    setBusy("save");
    try {
      const payload = await api.saveProfile(draft);
      importedAssetRef.current = "";
      applyPayload(payload);
      setDirty(false);
      toast.success("Appearance profile saved.");
    } catch (error) {
      toast.error(error?.message || "Could not save this appearance profile.");
    } finally {
      setBusy("");
    }
  };

  const importBackground = async () => {
    if (!api?.importBackground || busy) return;
    setBusy("import");
    try {
      const result = await api.importBackground();
      if (result?.canceled || !result?.asset) return;
      await discardImported();
      importedAssetRef.current = result.asset.id;
      const next = clone(draft);
      next.background.assetId = result.asset.id;
      next.background.fileName = result.asset.fileName;
      setDraft(next);
      setDraftBackgroundUrl(result.asset.url || "");
      setDirty(true);
    } catch (error) {
      toast.error(error?.message || "Could not import that background.");
    } finally {
      setBusy("");
    }
  };

  const runProfileAction = async (name, action) => {
    if (busy) return;
    setBusy(name);
    try {
      await discardImported();
      const payload = await action();
      applyPayload(payload);
      setDirty(false);
    } catch (error) {
      toast.error(error?.message || "Could not update appearance profiles.");
    } finally {
      setBusy("");
    }
  };

  const activate = (profileId) => runProfileAction("activate", () => api.activate(profileId));
  const duplicate = () => runProfileAction("duplicate", () => api.duplicate(activeProfile.id));
  const remove = () => runProfileAction("delete", () => api.delete(activeProfile.id));
  const reset = () => runProfileAction("reset", async () => {
    const payload = await api.reset();
    toast.success("Appearance restored to defaults.");
    return payload;
  });
  const relink = () => runProfileAction("relink", async () => {
    const result = await api.relink(activeProfile.id);
    if (result?.canceled) return result.appearance;
    toast.success("Background linked again.");
    return result?.appearance;
  });
  const useDefault = () => runProfileAction("default", async () => {
    const next = clone(activeProfile);
    next.background.assetId = "";
    next.background.fileName = "";
    return api.saveProfile(next);
  });

  const createProfile = async () => {
    await cancel();
    const next = clone(activeProfile);
    next.id = "";
    next.name = "New profile";
    setDraft(next);
    setDraftBackgroundUrl(appearance.backgroundUrl || "");
    setDirty(true);
  };

  if (!available || !draft) return null;

  return (
    <section className="mb-8 glass-panel rounded-xl p-5 sm:p-7" aria-labelledby="appearance-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Desktop appearance</p>
          <h2 id="appearance-title" className="mt-2 text-2xl font-semibold">Make it yours</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Backgrounds and profiles stay on this computer. Changes below preview immediately and save separately from account settings.
          </p>
        </div>
        <button type="button" className="btn-ghost min-h-11 px-4 text-sm" onClick={reset} disabled={Boolean(busy)}>
          Restore defaults
        </button>
      </div>

      {appearance.warning?.code === "BACKGROUND_MISSING" ? (
        <div className="mt-5 rounded-xl border border-amber-300/30 bg-amber-300/10 p-4">
          <p className="text-sm font-semibold text-amber-100">Background unavailable</p>
          <p className="mt-1 text-sm leading-6 text-amber-50/80">{missingCopy(appearance.warning)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-primary min-h-10 px-4 text-sm" onClick={relink} disabled={Boolean(busy)}>Choose again</button>
            <button type="button" className="btn-ghost min-h-10 px-4 text-sm" onClick={useDefault} disabled={Boolean(busy)}>Use default</button>
          </div>
        </div>
      ) : null}

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="space-y-4 rounded-xl border border-white/10 bg-black/10 p-4">
          <label className="block text-sm font-medium text-[var(--text)]">
            Saved profile
            <select
              value={appearance.activeProfileId}
              onChange={(event) => void activate(event.target.value)}
              disabled={Boolean(busy)}
              className="field mt-2 min-h-11 w-full"
            >
              {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-ghost min-h-10 px-3 text-xs" onClick={createProfile} disabled={Boolean(busy) || profiles.length >= 12}>New</button>
            <button type="button" className="btn-ghost min-h-10 px-3 text-xs" onClick={duplicate} disabled={Boolean(busy) || profiles.length >= 12}>Duplicate</button>
            <button type="button" className="btn-ghost col-span-2 min-h-10 px-3 text-xs text-red-200" onClick={remove} disabled={Boolean(busy) || profiles.length <= 1}>Delete profile</button>
          </div>
          <label className="block text-sm text-[var(--muted)]">
            Profile name
            <input
              type="text"
              maxLength={40}
              value={draft.name}
              onChange={(event) => updateDraft((next) => { next.name = event.target.value; })}
              className="field mt-2 min-h-11 w-full"
            />
          </label>
        </div>

        <div className="space-y-5 rounded-xl border border-white/10 bg-black/10 p-4">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">Custom background</h3>
                <p className="mt-1 text-xs text-[var(--muted)]">{draft.background.fileName || "Using HayKasa’s default background"}</p>
              </div>
              <button type="button" className="btn-ghost min-h-10 px-4 text-sm" onClick={importBackground} disabled={Boolean(busy)}>
                {busy === "import" ? "Importing…" : "Choose image"}
              </button>
            </div>
            {draft.background.assetId ? (
              <button
                type="button"
                className="mt-3 text-xs font-semibold text-[var(--muted)] underline-offset-4 hover:text-white hover:underline"
                onClick={() => {
                  updateDraft((next) => {
                    next.background.assetId = "";
                    next.background.fileName = "";
                  });
                  setDraftBackgroundUrl("");
                }}
              >
                Remove image
              </button>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <RangeControl label="Horizontal position" value={draft.background.positionX} min={0} max={100} suffix="%" onChange={(value) => updateDraft((next) => { next.background.positionX = value; })} />
            <RangeControl label="Vertical position" value={draft.background.positionY} min={0} max={100} suffix="%" onChange={(value) => updateDraft((next) => { next.background.positionY = value; })} />
            <RangeControl label="Crop / zoom" value={draft.background.zoom} min={1} max={1.8} step={0.05} onChange={(value) => updateDraft((next) => { next.background.zoom = value; })} />
            <RangeControl label="Blur" value={draft.background.blur} min={0} max={30} suffix=" px" onChange={(value) => updateDraft((next) => { next.background.blur = value; })} />
            <RangeControl label="Darkness" value={Math.round(draft.background.darkness * 100)} min={20} max={92} suffix="%" onChange={(value) => updateDraft((next) => { next.background.darkness = value / 100; })} />
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/10 p-4">
          <label className="flex min-h-11 items-center justify-between gap-4">
            <span>
              <span className="block text-sm font-semibold">Personal home message</span>
              <span className="mt-1 block text-xs text-[var(--muted)]">Replaces the greeting on Home and is always rendered as plain text.</span>
            </span>
            <input type="checkbox" checked={draft.home.visible} onChange={(event) => updateDraft((next) => { next.home.visible = event.target.checked; })} className="h-5 w-5 accent-[var(--accent)]" />
          </label>
          <textarea
            maxLength={160}
            rows={3}
            value={draft.home.message}
            disabled={!draft.home.visible}
            onChange={(event) => updateDraft((next) => { next.home.message = event.target.value; })}
            className="field mt-3 w-full resize-y p-3 disabled:opacity-50"
            placeholder="Kasa’s music room"
          />
          <p className="mt-1 text-right text-xs text-[var(--muted)]">{draft.home.message.length}/160</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="text-xs text-[var(--muted)]">Size
              <select value={draft.home.size} onChange={(event) => updateDraft((next) => { next.home.size = event.target.value; })} className="field mt-1 min-h-10 w-full">
                <option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option>
              </select>
            </label>
            <label className="text-xs text-[var(--muted)]">Alignment
              <select value={draft.home.align} onChange={(event) => updateDraft((next) => { next.home.align = event.target.value; })} className="field mt-1 min-h-10 w-full">
                <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
              </select>
            </label>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/10 p-4">
          <h3 className="text-sm font-semibold">Accent color</h3>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Use one color everywhere, or let the current artwork choose a readable accent.</p>
          <label className="mt-4 block text-xs text-[var(--muted)]">Mode
            <select value={draft.accent.mode} onChange={(event) => updateDraft((next) => { next.accent.mode = event.target.value; })} className="field mt-1 min-h-10 w-full">
              <option value="fixed">Fixed color</option><option value="album">Match current artwork</option>
            </select>
          </label>
          <label className="mt-4 flex min-h-12 items-center justify-between gap-4 text-sm text-[var(--muted)]">
            Fallback color
            <input type="color" value={draft.accent.fixedColor} onChange={(event) => updateDraft((next) => { next.accent.fixedColor = event.target.value; })} className="h-10 w-16 cursor-pointer rounded border border-white/15 bg-transparent p-1" />
          </label>
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-white/10 p-3">
            <span className="h-9 w-9 rounded-full border border-white/20" style={{ background: previewAccent }} />
            <span className="text-sm">Current preview · {previewAccent}</span>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-white/10 pt-5">
        <button type="button" className="btn-ghost min-h-11 px-5 text-sm" onClick={() => void cancel()} disabled={!dirty || Boolean(busy)}>Cancel changes</button>
        <button type="button" className="btn-primary min-h-11 px-5 text-sm" onClick={save} disabled={!dirty || Boolean(busy) || !draft.name.trim()}>
          {busy === "save" ? "Saving…" : "Save profile"}
        </button>
      </div>
    </section>
  );
}
