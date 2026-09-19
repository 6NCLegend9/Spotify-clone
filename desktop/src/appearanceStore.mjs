import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const APPEARANCE_STORE_VERSION = 1;
export const MAX_APPEARANCE_PROFILES = 12;
export const MAX_BACKGROUND_BYTES = 20 * 1024 * 1024;
export const MAX_BACKGROUND_DIMENSION = 12_000;

const PROFILE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const ASSET_ID = /^[0-9a-f-]{36}$/i;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const SIZES = new Set(["small", "medium", "large"]);
const ALIGNMENTS = new Set(["left", "center", "right"]);
const ACCENT_MODES = new Set(["fixed", "album"]);

function text(value, max) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function bounded(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function safeFileName(value) {
  return text(path.basename(String(value || "background.jpg")), 120) || "background.jpg";
}

export function defaultAppearanceProfile() {
  return {
    id: "default",
    name: "Night",
    background: {
      assetId: "",
      fileName: "",
      positionX: 50,
      positionY: 50,
      zoom: 1,
      blur: 0,
      darkness: 0.58,
    },
    home: {
      visible: false,
      message: "",
      size: "medium",
      align: "left",
    },
    accent: {
      mode: "fixed",
      fixedColor: "#00e6e6",
    },
  };
}

export function sanitizeAppearanceProfile(value, { fallbackId = "" } = {}) {
  const input = value && typeof value === "object" ? value : {};
  const background = input.background && typeof input.background === "object" ? input.background : {};
  const home = input.home && typeof input.home === "object" ? input.home : {};
  const accent = input.accent && typeof input.accent === "object" ? input.accent : {};
  const defaultProfile = defaultAppearanceProfile();
  const idCandidate = text(input.id || fallbackId, 64);
  const id = PROFILE_ID.test(idCandidate) ? idCandidate : crypto.randomUUID();
  const assetId = ASSET_ID.test(String(background.assetId || "")) ? String(background.assetId) : "";

  return {
    id,
    name: text(input.name, 40) || "Untitled profile",
    background: {
      assetId,
      fileName: assetId ? safeFileName(background.fileName) : "",
      positionX: bounded(background.positionX, 50, 0, 100),
      positionY: bounded(background.positionY, 50, 0, 100),
      zoom: bounded(background.zoom, 1, 1, 1.8),
      blur: bounded(background.blur, 0, 0, 30),
      darkness: bounded(background.darkness, 0.58, 0.2, 0.92),
    },
    home: {
      visible: home.visible === true,
      message: text(home.message, 160),
      size: SIZES.has(home.size) ? home.size : defaultProfile.home.size,
      align: ALIGNMENTS.has(home.align) ? home.align : defaultProfile.home.align,
    },
    accent: {
      mode: ACCENT_MODES.has(accent.mode) ? accent.mode : defaultProfile.accent.mode,
      fixedColor: HEX_COLOR.test(String(accent.fixedColor || ""))
        ? String(accent.fixedColor).toLowerCase()
        : defaultProfile.accent.fixedColor,
    },
  };
}

function sanitizeAsset(value) {
  const input = value && typeof value === "object" ? value : {};
  const id = String(input.id || "");
  if (!ASSET_ID.test(id)) return null;
  return {
    id,
    storedName: `${id}.jpg`,
    fileName: safeFileName(input.fileName),
    createdAt: Number.isFinite(input.createdAt) ? Math.max(0, Math.floor(input.createdAt)) : 0,
  };
}

function sanitizeStore(value) {
  const input = value && typeof value === "object" ? value : {};
  const profiles = [];
  const ids = new Set();
  for (const item of Array.isArray(input.profiles) ? input.profiles : []) {
    const profile = sanitizeAppearanceProfile(item);
    if (ids.has(profile.id)) continue;
    ids.add(profile.id);
    profiles.push(profile);
    if (profiles.length >= MAX_APPEARANCE_PROFILES) break;
  }
  if (profiles.length === 0) profiles.push(defaultAppearanceProfile());

  const assets = [];
  const assetIds = new Set();
  for (const item of Array.isArray(input.assets) ? input.assets : []) {
    const asset = sanitizeAsset(item);
    if (!asset || assetIds.has(asset.id)) continue;
    assetIds.add(asset.id);
    assets.push(asset);
    if (assets.length >= MAX_APPEARANCE_PROFILES * 2) break;
  }

  const requestedActive = String(input.activeProfileId || "");
  const activeProfileId = profiles.some((profile) => profile.id === requestedActive)
    ? requestedActive
    : profiles[0].id;
  return {
    version: APPEARANCE_STORE_VERSION,
    activeProfileId,
    profiles,
    assets,
  };
}

export class AppearanceStore {
  constructor(userDataDir) {
    this.directory = path.join(userDataDir, "appearance");
    this.backgroundsDirectory = path.join(this.directory, "backgrounds");
    this.file = path.join(this.directory, "appearance.json");
    this.value = sanitizeStore(null);
    this.load();
    this.collectUnusedAssets();
  }

  load() {
    try {
      this.value = sanitizeStore(JSON.parse(fs.readFileSync(this.file, "utf8")));
    } catch {
      this.value = sanitizeStore(null);
    }
    return this.getAll();
  }

  save() {
    fs.mkdirSync(this.directory, { recursive: true });
    const temp = `${this.file}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(this.value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temp, this.file);
  }

  getAll() {
    return JSON.parse(JSON.stringify(this.value));
  }

  activeProfile() {
    return this.value.profiles.find((profile) => profile.id === this.value.activeProfileId)
      || this.value.profiles[0];
  }

  saveProfile(value) {
    const requestedId = text(value?.id, 64);
    const existingIndex = this.value.profiles.findIndex((profile) => profile.id === requestedId);
    if (existingIndex < 0 && this.value.profiles.length >= MAX_APPEARANCE_PROFILES) {
      throw new Error(`You can save up to ${MAX_APPEARANCE_PROFILES} appearance profiles.`);
    }
    const profile = sanitizeAppearanceProfile(value, {
      fallbackId: existingIndex >= 0 ? requestedId : crypto.randomUUID(),
    });
    if (profile.background.assetId && !this.value.assets.some((asset) => asset.id === profile.background.assetId)) {
      throw new Error("The selected background is no longer available.");
    }
    if (existingIndex >= 0) this.value.profiles[existingIndex] = profile;
    else this.value.profiles.push(profile);
    this.value.activeProfileId = profile.id;
    this.save();
    this.collectUnusedAssets();
    return this.getAll();
  }

  activate(profileId) {
    const id = String(profileId || "");
    if (!this.value.profiles.some((profile) => profile.id === id)) {
      throw new Error("Appearance profile not found.");
    }
    this.value.activeProfileId = id;
    this.save();
    return this.getAll();
  }

  duplicate(profileId) {
    if (this.value.profiles.length >= MAX_APPEARANCE_PROFILES) {
      throw new Error(`You can save up to ${MAX_APPEARANCE_PROFILES} appearance profiles.`);
    }
    const source = this.value.profiles.find((profile) => profile.id === String(profileId || ""));
    if (!source) throw new Error("Appearance profile not found.");
    const copy = sanitizeAppearanceProfile({
      ...source,
      id: crypto.randomUUID(),
      name: `${source.name} copy`,
    });
    this.value.profiles.push(copy);
    this.value.activeProfileId = copy.id;
    this.save();
    return this.getAll();
  }

  delete(profileId) {
    const id = String(profileId || "");
    if (this.value.profiles.length <= 1) throw new Error("Keep at least one appearance profile.");
    const next = this.value.profiles.filter((profile) => profile.id !== id);
    if (next.length === this.value.profiles.length) throw new Error("Appearance profile not found.");
    this.value.profiles = next;
    if (this.value.activeProfileId === id) this.value.activeProfileId = next[0].id;
    this.save();
    this.collectUnusedAssets();
    return this.getAll();
  }

  reset() {
    const assetFiles = this.value.assets.map((asset) => this.assetPath(asset.id)).filter(Boolean);
    this.value = sanitizeStore(null);
    this.save();
    assetFiles.forEach((file) => {
      try { fs.rmSync(file, { force: true }); } catch { /* best effort */ }
    });
    return this.getAll();
  }

  registerAsset({ id = crypto.randomUUID(), fileName = "background.jpg" } = {}) {
    if (!ASSET_ID.test(id)) throw new Error("Invalid background asset.");
    const asset = sanitizeAsset({ id, fileName, createdAt: Date.now() });
    this.value.assets = [...this.value.assets.filter((item) => item.id !== id), asset];
    this.save();
    return { ...asset };
  }

  assetPath(assetId) {
    const id = String(assetId || "");
    if (!ASSET_ID.test(id)) return "";
    const asset = this.value.assets.find((item) => item.id === id);
    return asset ? path.join(this.backgroundsDirectory, asset.storedName) : "";
  }

  asset(assetId) {
    return this.value.assets.find((item) => item.id === String(assetId || "")) || null;
  }

  discardAsset(assetId) {
    const id = String(assetId || "");
    const used = this.value.profiles.some((profile) => profile.background.assetId === id);
    if (used) return false;
    const file = this.assetPath(id);
    this.value.assets = this.value.assets.filter((asset) => asset.id !== id);
    this.save();
    if (file) {
      try { fs.rmSync(file, { force: true }); } catch { /* best effort */ }
    }
    return true;
  }

  collectUnusedAssets() {
    const used = new Set(this.value.profiles.map((profile) => profile.background.assetId).filter(Boolean));
    const stale = this.value.assets.filter((asset) => !used.has(asset.id));
    if (stale.length === 0) return;
    this.value.assets = this.value.assets.filter((asset) => used.has(asset.id));
    this.save();
    stale.forEach((asset) => {
      try { fs.rmSync(path.join(this.backgroundsDirectory, asset.storedName), { force: true }); } catch { /* best effort */ }
    });
  }

  resolve() {
    const profile = this.activeProfile();
    const asset = profile.background.assetId ? this.asset(profile.background.assetId) : null;
    const file = asset ? this.assetPath(asset.id) : "";
    const missing = Boolean(asset && (!file || !fs.existsSync(file)));
    return {
      ...this.getAll(),
      activeProfile: JSON.parse(JSON.stringify(profile)),
      backgroundUrl: asset && !missing ? `heykasa-media://background/${asset.id}` : "",
      warning: missing
        ? {
            code: "BACKGROUND_MISSING",
            fileName: asset.fileName || profile.background.fileName || "background image",
          }
        : null,
    };
  }
}

export function appearanceAssetId(value) {
  const match = /^heykasa-media:\/\/background\/([0-9a-f-]{36})\/?$/i.exec(String(value || ""));
  return match && ASSET_ID.test(match[1]) ? match[1] : "";
}
