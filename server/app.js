import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { getDatabase } from "./db/connection.js";
import { createAuthRouter } from "./routes/auth.js";
import { createCatalogRouter } from "./routes/catalog.js";
import { createDiscoveryRouter } from "./routes/discovery.js";
import { createEventsRouter } from "./routes/events.js";
import { createLibraryRouter } from "./routes/library.js";
import { createLyricsRouter } from "./routes/lyrics.js";
import { createMediaRouter } from "./routes/media.js";
import { createRecommendationsRouter } from "./routes/recommendations.js";
import { createTrackRouter } from "./routes/tracks.js";
import { createYouTubeRouter } from "./routes/youtube.js";
import { getSessionSecret } from "./lib/session.js";

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || "../.env" });

const app = express();

app.use(cors({ origin: process.env.SITE_URL || "http://localhost:5173", credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser(getSessionSecret()));

app.get("/api", (_req, res) => res.json({ service: "musicon-api", status: "ok" }));
app.get("/api/health", async (_req, res) => {
  try { const db = await getDatabase(); await db.command({ ping: 1 }); res.json({ status: "ok", database: "ok" }); }
  catch { res.status(503).json({ status: "error", database: "unavailable" }); }
});
app.use("/api/auth", createAuthRouter());
app.use("/api", createCatalogRouter());
app.use("/api", createDiscoveryRouter());
app.use("/api/lyrics", createLyricsRouter());
app.use("/api/media", createMediaRouter());
app.use("/api/tracks", createTrackRouter());
app.use("/api/youtube", createYouTubeRouter());
app.use("/api", createEventsRouter());
app.use("/api", createLibraryRouter());
app.use("/api/recommendations", createRecommendationsRouter());

const port = Number(process.env.PORT || 5000);
if (process.env.NODE_ENV !== "test") app.listen(port, () => console.log(`Musicon API listening on ${port}`));
export default app;
