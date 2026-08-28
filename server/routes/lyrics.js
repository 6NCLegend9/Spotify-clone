import { Router } from "express";
import { readText } from "../lib/filterBuilder.js";
import { createGeniusClient } from "../lib/genius.js";
import { createRateLimiter } from "../lib/rateLimit.js";
import { requireUser } from "./auth.js";

function sendGeniusError(res, error) {
  if (error?.code === "GENIUS_UNCONFIGURED") return res.status(503).json({ message: "Genius lyrics lookup is not configured" });
  if (error?.code === "GENIUS_AUTH") return res.status(503).json({ message: "Genius lyrics lookup is unavailable. Check the server configuration." });
  if (error?.code === "GENIUS_RATE_LIMIT") return res.status(429).json({ message: "Genius lyrics lookup is busy. Try again shortly." });
  if (error?.code === "GENIUS_TIMEOUT") return res.status(504).json({ message: "Genius did not respond in time" });
  return res.status(502).json({ message: "Genius lyrics lookup is temporarily unavailable" });
}

export function createLyricsRouter() {
  const router = Router();
  const genius = createGeniusClient();
  const lookupLimiter = createRateLimiter({ limit: 20, windowMs: 60000 });

  router.get("/genius", requireUser, lookupLimiter, async (req, res) => {
    const title = readText(req.query.title, 180);
    const artistName = readText(req.query.artist, 160);
    if (!title || !artistName) return res.status(400).json({ message: "A song title and artist are required" });

    try {
      return res.json({ data: await genius.searchSong({ title, artistName }) });
    } catch (error) {
      return sendGeniusError(res, error);
    }
  });

  return router;
}