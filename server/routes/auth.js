import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDatabase } from "../db/connection.js";
import { COLLECTIONS } from "../db/collections.js";
import { readText } from "../lib/filterBuilder.js";
import { serializeUser } from "../lib/serializers.js";
import { clearSession, getSessionUserId, setSession } from "../lib/session.js";

const DEMO_EMAIL = "demo@musicon.local";
const equalizerFrequencies = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const equalizerPresets = new Set(["Flat", "Bass Boost", "Treble Boost", "Vocal", "Night", "Boost Bass", "Boost Treble", "Rock", "Pop", "Hip-Hop/Rap", "Custom"]);
const qualityModes = new Set(["auto", "low", "medium", "high", "ultra"]);
const repeatModes = new Set(["off", "context", "one"]);
const crossfadeDurations = new Set([0, 2, 4, 6, 8]);
const deviceIds = new Set(["this-computer", "studio-speaker", "pocket-player"]);

export function createDefaultSettings(now = new Date()) {
  return {
    volume: 0.8,
    muted: false,
    shuffle: false,
    repeatMode: "off",
    crossfadeSeconds: 4,
    equalizer: {
      enabled: true,
      preset: "Flat",
      bands: equalizerFrequencies.map((frequency) => ({ frequency, gainDb: 0 })),
    },
    eqBands: equalizerFrequencies.map(() => 0),
    eqPreset: "Flat",
    qualityMode: "auto",
    qualityEffective: "high",
    dataSaverEnabled: false,
    normalizeVolume: false,
    skipSilence: false,
    allowDownloads: false,
    keyboardShortcutsEnabled: true,
    activeDeviceId: "this-computer",
    updatedAt: now,
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function validBandGains(value) {
  if (!Array.isArray(value) || value.length !== equalizerFrequencies.length) return null;
  const gains = value.map((band) => Number(typeof band === "object" && band ? band.gainDb : band));
  return gains.every(Number.isFinite) ? gains.map((gain) => clamp(gain, -12, 12)) : null;
}

function buildSettingsUpdate(payload) {
  const body = isPlainObject(payload) ? payload : {};
  const changes = {};
  const booleans = ["muted", "shuffle", "dataSaverEnabled", "normalizeVolume", "skipSilence", "allowDownloads", "keyboardShortcutsEnabled"];

  if (Number.isFinite(body.volume)) changes["settings.volume"] = clamp(body.volume, 0, 1);
  if (repeatModes.has(body.repeatMode)) changes["settings.repeatMode"] = body.repeatMode;
  if (crossfadeDurations.has(body.crossfadeSeconds)) changes["settings.crossfadeSeconds"] = body.crossfadeSeconds;
  if (qualityModes.has(body.qualityMode)) changes["settings.qualityMode"] = body.qualityMode;
  if (qualityModes.has(body.qualityEffective)) changes["settings.qualityEffective"] = body.qualityEffective;
  if (deviceIds.has(body.activeDeviceId)) changes["settings.activeDeviceId"] = body.activeDeviceId;

  for (const key of booleans) {
    if (typeof body[key] === "boolean") changes[`settings.${key}`] = body[key];
  }

  const equalizer = isPlainObject(body.equalizer) ? body.equalizer : {};
  if (typeof equalizer.enabled === "boolean") changes["settings.equalizer.enabled"] = equalizer.enabled;
  if (equalizerPresets.has(equalizer.preset)) {
    changes["settings.equalizer.preset"] = equalizer.preset;
    changes["settings.eqPreset"] = equalizer.preset;
  }

  const bands = validBandGains(equalizer.bands || body.eqBands);
  if (bands) {
    changes["settings.equalizer.bands"] = equalizerFrequencies.map((frequency, index) => ({ frequency, gainDb: bands[index] }));
    changes["settings.eqBands"] = bands;
  }

  return changes;
}

export async function requireUser(req, res, next) {
  const sessionUserId = getSessionUserId(req);
  if (!ObjectId.isValid(sessionUserId)) return res.status(401).json({ message: "Demo session required" });

  try {
    const db = await getDatabase();
    const user = await db.collection(COLLECTIONS.users).findOne({ _id: new ObjectId(sessionUserId) });
    if (!user) return res.status(401).json({ message: "Demo session required" });
    req.user = user;
    return next();
  } catch {
    return res.status(503).json({ message: "Session service unavailable" });
  }
}

export function createAuthRouter() {
  const router = Router();

  router.post("/demo-login", async (_req, res) => {
    try {
      const db = await getDatabase();
      const now = new Date();
      await db.collection(COLLECTIONS.users).updateOne(
        { email: DEMO_EMAIL },
        {
          $setOnInsert: {
            displayName: "Demo Listener",
            email: DEMO_EMAIL,
            avatarUrl: "",
            createdAt: now,
            updatedAt: now,
            settings: createDefaultSettings(now),
            tasteProfile: { topGenres: [], topArtists: [], lastUpdatedAt: now },
          },
        },
        { upsert: true },
      );
      const user = await db.collection(COLLECTIONS.users).findOne({ email: DEMO_EMAIL });
      setSession(res, user._id);
      return res.json({ user: serializeUser(user) });
    } catch {
      return res.status(503).json({ message: "Demo login is unavailable" });
    }
  });

  router.post("/logout", (_req, res) => {
    clearSession(res);
    return res.json({ status: "ok" });
  });

  router.get("/session", async (req, res) => {
    const sessionUserId = getSessionUserId(req);
    if (!ObjectId.isValid(sessionUserId)) return res.json({ user: null });

    try {
      const db = await getDatabase();
      const user = await db.collection(COLLECTIONS.users).findOne({ _id: new ObjectId(sessionUserId) });
      return res.json({ user: serializeUser(user) });
    } catch {
      return res.status(503).json({ message: "Session service unavailable" });
    }
  });

  router.get("/me", requireUser, async (req, res) => {
    try {
      const db = await getDatabase();
      const [playlistCount, likedSongsCount] = await Promise.all([
        db.collection(COLLECTIONS.playlists).countDocuments({ ownerId: req.user._id }),
        db.collection(COLLECTIONS.likes).countDocuments({ userId: req.user._id }),
      ]);
      return res.json({ user: serializeUser(req.user), stats: { playlistCount, likedSongsCount } });
    } catch {
      return res.status(503).json({ message: "Profile service unavailable" });
    }
  });

  router.patch("/me", requireUser, async (req, res) => {
    const body = isPlainObject(req.body) ? req.body : {};
    const changes = {};

    if (Object.hasOwn(body, "displayName")) {
      const displayName = readText(body.displayName, 48);
      if (!/^[A-Za-z0-9 .,'-]{2,48}$/.test(displayName)) return res.status(400).json({ message: "Display name must be 2-48 valid characters" });
      changes.displayName = displayName;
    }
    if (Object.hasOwn(body, "avatarUrl")) {
      const avatarUrl = readText(body.avatarUrl, 2000);
      if (avatarUrl && !/^https:\/\//i.test(avatarUrl)) return res.status(400).json({ message: "Avatar URL must use HTTPS" });
      changes.avatarUrl = avatarUrl;
    }
    if (Object.keys(changes).length === 0) return res.status(400).json({ message: "No supported profile changes" });

    try {
      changes.updatedAt = new Date();
      const db = await getDatabase();
      await db.collection(COLLECTIONS.users).updateOne({ _id: req.user._id }, { $set: changes });
      const user = await db.collection(COLLECTIONS.users).findOne({ _id: req.user._id });
      return res.json({ user: serializeUser(user) });
    } catch {
      return res.status(503).json({ message: "Profile update is unavailable" });
    }
  });

  router.patch("/me/settings", requireUser, async (req, res) => {
    const changes = buildSettingsUpdate(req.body);
    if (Object.keys(changes).length === 0) return res.status(400).json({ message: "No supported settings changes" });

    try {
      const now = new Date();
      changes["settings.updatedAt"] = now;
      changes.updatedAt = now;
      const db = await getDatabase();
      await db.collection(COLLECTIONS.users).updateOne({ _id: req.user._id }, { $set: changes });
      const user = await db.collection(COLLECTIONS.users).findOne({ _id: req.user._id });
      return res.json({ user: serializeUser(user) });
    } catch {
      return res.status(503).json({ message: "Settings update is unavailable" });
    }
  });

  return router;
}