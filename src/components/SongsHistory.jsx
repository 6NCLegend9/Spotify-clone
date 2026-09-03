'use client';
import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useSession } from 'next-auth/react';
import { requestJson } from '@/services/http';

const isValidEntry = (entry) =>
  entry &&
  typeof entry === "object" &&
  ((typeof entry.id === "string" && entry.id.trim()) ||
    (typeof entry.id === "number" && Number.isFinite(entry.id))) &&
  ((typeof entry.name === "string" && entry.name.trim()) ||
    (typeof entry.title === "string" && entry.title.trim()));

const pushHistoryEntry = (entry) => {
  if (!isValidEntry(entry)) return;

  try {
    const storedSongHistory = window.localStorage.getItem("songHistory");
    const parsedSongHistory = storedSongHistory ? JSON.parse(storedSongHistory) : [];
    const safeHistory = Array.isArray(parsedSongHistory)
      ? parsedSongHistory.filter(isValidEntry)
      : [];
    const updatedHistory = safeHistory
      .filter((song) => String(song.id) !== String(entry.id))
      .slice(0, 8);
    window.localStorage.setItem("songHistory", JSON.stringify([entry, ...updatedHistory]));
  } catch {
    // Listening history is best-effort when browser storage is blocked or corrupt.
  }
};

// Best-effort sync to the server so history follows the signed-in account.
// Guests never persist listening history locally or on the server.
const syncHistoryEntry = (entry) => {
  void requestJson("/api/history", {
    method: "POST",
    body: { entry },
    fallbackTitle: "Listening history couldn’t sync",
    fallbackMessage: "This play may only appear in this browser.",
  }).catch(() => {});
};

const SongsHistory = () => {
  const { activeSong, youtubeVideo } = useSelector((state) => state.player || {});
  const { status } = useSession();
  const isAuthenticated = status === "authenticated";

  useEffect(() => {
    if (!isAuthenticated || !isValidEntry(activeSong)) return;
    pushHistoryEntry(activeSong);
    syncHistoryEntry(activeSong);
  }, [activeSong, isAuthenticated]);

  // YouTube is the primary playback path now; without this, "Listen Again" never records real usage.
  useEffect(() => {
    if (!isAuthenticated || !youtubeVideo?.id) return;
    const entry = {
      source: "youtube",
      id: youtubeVideo.id,
      title: youtubeVideo.title,
      channel: youtubeVideo.channel,
      thumbnail: youtubeVideo.thumbnail,
    };
    if (!isValidEntry(entry)) return;
    pushHistoryEntry(entry);
    syncHistoryEntry(entry);
  }, [youtubeVideo, isAuthenticated]);

  return null;
}

export default SongsHistory