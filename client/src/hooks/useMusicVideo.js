import { useEffect, useState } from "react";
import { api, withQuery } from "../lib/api";

function normalize(value) {
  return String(value || "").toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function includesExpectedText(value, expected) {
  const normalizedValue = normalize(value);
  const normalizedExpected = normalize(expected);
  return Boolean(normalizedExpected) && normalizedValue.includes(normalizedExpected);
}

function getSearchTitle(value) {
  const title = String(value || "").replace(/\s+-\s+(?:from\b|(?:\d{4}\s+)?remaster(?:ed)?\b|radio edit\b).*$/i, "");
  return title.replace(/\s*\([^)]*\)/g, " ").replace(/\s*\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
}

function getPrimaryArtist(value) {
  return String(value || "").split(/[,/&]/)[0].trim();
}

function scoreMatchingVideo(video, title, artistName, expectedDurationSec) {
  const titleMatches = includesExpectedText(video?.title, title);
  const artistMatches = includesExpectedText(video?.title, artistName) || includesExpectedText(video?.artistName, artistName);
  if (!titleMatches || !artistMatches) return -1;
  const source = `${video.title || ""} ${video.artistName || ""}`.toLocaleLowerCase();
  const candidateDuration = Number(video.durationSec) || 0;
  const durationScore = expectedDurationSec > 0 && candidateDuration > 0 ? Math.max(0, 15 - Math.abs(candidateDuration - expectedDurationSec)) : 0;
  return 10 + durationScore + (source.includes("official") ? 2 : 0) + (source.includes("vevo") ? 1 : 0);
}

function findMatchingVideo(videos, title, artistName, expectedDurationSec) {
  return (videos || []).map((video) => ({ video, score: scoreMatchingVideo(video, title, artistName, expectedDurationSec) }))
    .filter((candidate) => candidate.score >= 0)
    .sort((left, right) => right.score - left.score)[0]?.video || null;
}

export function useMusicVideo(track, enabled = true) {
  const title = typeof track?.title === "string" ? track.title.trim() : "";
  const artistName = typeof track?.artistName === "string" ? track.artistName.trim() : "";
  const searchTitle = getSearchTitle(title);
  const primaryArtist = getPrimaryArtist(artistName);
  const expectedDurationSec = Number(track?.durationSec) || 0;
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (!enabled || !searchTitle || !primaryArtist) {
      setVideo(null);
      setLoading(false);
      setError("");
      return () => { active = false; };
    }

    const load = async () => {
      setVideo(null);
      setLoading(true);
      setError("");
      try {
        const response = await api.get(withQuery("/api/youtube/search", { query: `${primaryArtist} ${searchTitle} official music video`, limit: 8 }));
        if (!active) return;
        setVideo(findMatchingVideo(response.data, searchTitle, primaryArtist, expectedDurationSec));
      } catch (requestError) {
        if (active) setError(requestError.message || "Music video lookup is unavailable");
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, [enabled, expectedDurationSec, primaryArtist, searchTitle]);

  return { video, loading, error };
}