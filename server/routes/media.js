import { Router } from "express";
import { getDatabase } from "../db/connection.js";
import { COLLECTIONS } from "../db/collections.js";

const qualityProfiles = {
  low: 8000,
  medium: 16000,
  high: 22050,
  ultra: 44100,
};

function createToneWav(frequency, sampleRate, durationSeconds = 8) {
  const sampleCount = sampleRate * durationSeconds;
  const buffer = Buffer.alloc(44 + sampleCount);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + sampleCount, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate, 28);
  buffer.writeUInt16LE(1, 32);
  buffer.writeUInt16LE(8, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(sampleCount, 40);

  for (let index = 0; index < sampleCount; index += 1) {
    const envelope = Math.min(1, index / (sampleRate / 4), (sampleCount - index) / (sampleRate / 4));
    const time = index / sampleRate;
    const sample = (Math.sin(2 * Math.PI * frequency * time) * 0.1 + Math.sin(2 * Math.PI * frequency * 1.5 * time) * 0.04) * envelope;
    buffer.writeUInt8(Math.round(128 + sample * 127), 44 + index);
  }
  return buffer;
}

export function createMediaRouter() {
  const router = Router();

  router.get("/:catalogKey", async (req, res) => {
    const catalogKey = typeof req.params.catalogKey === "string" ? req.params.catalogKey : "";
    if (!/^track-\d{1,4}$/.test(catalogKey)) return res.status(404).end();
    const quality = Object.hasOwn(qualityProfiles, req.query.quality) ? req.query.quality : "high";

    try {
      const db = await getDatabase();
      const track = await db.collection(COLLECTIONS.tracks).findOne({ catalogKey }, { projection: { catalogKey: 1 } });
      if (!track) return res.status(404).end();
      const trackNumber = Number.parseInt(catalogKey.slice(6), 10);
      const frequency = 120 + (trackNumber % 7) * 45;
      res.set({ "Content-Type": "audio/wav", "Cache-Control": "public, max-age=3600" });
      return res.send(createToneWav(frequency, qualityProfiles[quality]));
    } catch {
      return res.status(503).end();
    }
  });

  return router;
}