import { readPageSize, readText } from "../lib/filterBuilder.js";
import { createRateLimiter } from "../lib/rateLimit.js";
import { requireUser } from "./auth.js";
import { Router } from "express";

const YOUTUBE_API_URL = "https://www.googleapis.com/youtube/v3";
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const REGION_CODE_PATTERN = /^[A-Z]{2}$/;

function getApiKey() {
  return typeof process.env.YOUTUBE_API_KEY === "string" ? process.env.YOUTUBE_API_KEY.trim() : "";
}

function readRegionCode(value) {
  const regionCode = readText(value, 2).toUpperCase();
  return REGION_CODE_PATTERN.test(regionCode) ? regionCode : "US";
}

function parseDuration(value) {
  if (typeof value !== "string") return 0;
  const match = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value);
  if (!match) return 0;
  const [, days = "0", hours = "0", minutes = "0", seconds = "0"] = match;
  return Number(days) * 86400 + Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

function getThumbnail(thumbnails) {
  if (!thumbnails || typeof thumbnails !== "object") return null;
  return [thumbnails.maxres, thumbnails.standard, thumbnails.high, thumbnails.medium, thumbnails.default]
    .find((thumbnail) => typeof thumbnail?.url === "string" && thumbnail.url)?.url || null;
}

function serializeVideo(video) {
  const videoId = typeof video?.id === "string" ? video.id : "";
  if (!VIDEO_ID_PATTERN.test(videoId) || video?.status?.embeddable === false) return null;
  const snippet = video.snippet || {};
  const title = readText(snippet.title, 200);
  const channelName = readText(snippet.channelTitle, 160);
  if (!title || !channelName) return null;

  return {
    id: `youtube:${videoId}`,
    provider: "youtube",
    videoId,
    title,
    artistName: channelName,
    channelId: readText(snippet.channelId, 80) || null,
    coverUrl: getThumbnail(snippet.thumbnails),
    durationSec: parseDuration(video.contentDetails?.duration),
    publishedAt: typeof snippet.publishedAt === "string" ? snippet.publishedAt : null,
    youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

async function requestYouTube(resource, parameters) {
  const apiKey = getApiKey();
  if (!apiKey) {
    const error = new Error("YouTube integration is not configured");
    error.code = "YOUTUBE_UNCONFIGURED";
    throw error;
  }

  const url = new URL(`${YOUTUBE_API_URL}/${resource}`);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, String(value));
  url.searchParams.set("key", apiKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      const error = new Error("YouTube request failed");
      error.status = response.status;
      throw error;
    }
    return response.json();
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error("YouTube request timed out");
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function findVideos(videoIds) {
  if (!videoIds.length) return [];
  const payload = await requestYouTube("videos", {
    part: "snippet,contentDetails,status",
    id: videoIds.join(","),
    maxResults: videoIds.length,
  });
  const videosById = new Map((payload.items || []).map((video) => [video.id, video]));
  return videoIds.map((videoId) => serializeVideo(videosById.get(videoId))).filter(Boolean);
}

function sendYouTubeError(res, error) {
  if (error.code === "YOUTUBE_UNCONFIGURED") return res.status(503).json({ message: "YouTube integration is not configured" });
  if (error.status === 429) return res.status(429).json({ message: "YouTube quota is temporarily unavailable. Try again shortly." });
  if (error.status === 403) return res.status(503).json({ message: "YouTube search is unavailable. Check the API key restrictions and quota." });
  if (error.status === 504) return res.status(504).json({ message: "YouTube did not respond in time" });
  return res.status(502).json({ message: "YouTube data is temporarily unavailable" });
}

export function createYouTubeRouter() {
  const router = Router();
  const searchLimiter = createRateLimiter({ limit: 20, windowMs: 60000 });
  const trendingLimiter = createRateLimiter({ limit: 12, windowMs: 60000 });

  router.get("/search", requireUser, searchLimiter, async (req, res) => {
    const query = readText(req.query.query, 100);
    const limit = readPageSize(req.query.limit, 12, 20);
    if (!query) return res.json({ data: [] });

    try {
      const searchPayload = await requestYouTube("search", {
        part: "snippet",
        q: query,
        type: "video",
        videoCategoryId: "10",
        videoEmbeddable: "true",
        safeSearch: "moderate",
        maxResults: limit,
      });
      const videoIds = (searchPayload.items || []).map((item) => item?.id?.videoId).filter((videoId) => VIDEO_ID_PATTERN.test(videoId));
      return res.json({ data: await findVideos(videoIds) });
    } catch (error) {
      return sendYouTubeError(res, error);
    }
  });

  router.get("/trending", requireUser, trendingLimiter, async (req, res) => {
    const limit = readPageSize(req.query.limit, 8, 20);
    const regionCode = readRegionCode(req.query.region);
    try {
      const payload = await requestYouTube("videos", {
        part: "snippet,contentDetails,status",
        chart: "mostPopular",
        videoCategoryId: "10",
        regionCode,
        maxResults: limit,
      });
      return res.json({ data: (payload.items || []).map(serializeVideo).filter(Boolean), regionCode });
    } catch (error) {
      return sendYouTubeError(res, error);
    }
  });

  router.get("/videos/:videoId", requireUser, async (req, res) => {
    const videoId = typeof req.params.videoId === "string" ? req.params.videoId : "";
    if (!VIDEO_ID_PATTERN.test(videoId)) return res.status(404).json({ message: "Video not found" });

    try {
      const [video] = await findVideos([videoId]);
      if (!video) return res.status(404).json({ message: "Video not found" });
      return res.json({ data: video });
    } catch (error) {
      return sendYouTubeError(res, error);
    }
  });

  return router;
}