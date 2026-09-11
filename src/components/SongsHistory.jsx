'use client';
import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useSession } from 'next-auth/react';
import { requestJson } from '@/services/http';
import { accountOwner, readAccountCache, writeAccountCache } from '@/utils/accountCache.mjs';

const isValidEntry = (entry) =>
  entry &&
  typeof entry === "object" &&
  ((typeof entry.id === "string" && entry.id.trim()) ||
    (typeof entry.id === "number" && Number.isFinite(entry.id))) &&
  ((typeof entry.name === "string" && entry.name.trim()) ||
    (typeof entry.title === "string" && entry.title.trim()));

const pushHistoryEntry = (entry, owner) => {
  if (!isValidEntry(entry)) return;

  try {
    const parsedSongHistory = readAccountCache(window.localStorage, "heykasa:history:v1", owner, 30 * 86400_000);
    const safeHistory = Array.isArray(parsedSongHistory)
      ? parsedSongHistory.filter(isValidEntry)
      : [];
    const updatedHistory = safeHistory
      .filter((song) => String(song.id) !== String(entry.id))
      .slice(0, 8);
    writeAccountCache(window.localStorage, "heykasa:history:v1", owner, [entry, ...updatedHistory]);
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
  const { activeSong, youtubeVideo, playbackOwner, isPlaying } = useSelector((state) => state.player || {});
  const privateSession = useSelector((state) => state.settings.privateSession);
  const { data: session, status } = useSession();
  const owner = accountOwner(session, status);
  const canRecord = status === "authenticated" && owner && owner === playbackOwner && isPlaying && !privateSession;

  useEffect(() => {
    if (!canRecord || !isValidEntry(activeSong)) return;
    pushHistoryEntry(activeSong, owner);
    syncHistoryEntry(activeSong);
  }, [activeSong, canRecord, owner]);

  // YouTube is the primary playback path now; without this, "Listen Again" never records real usage.
  useEffect(() => {
    if (!canRecord || !youtubeVideo?.id) return;
    const entry = {
      source: "youtube",
      id: youtubeVideo.id,
      title: youtubeVideo.title,
      channel: youtubeVideo.channel,
      thumbnail: youtubeVideo.thumbnail,
    };
    if (!isValidEntry(entry)) return;
    pushHistoryEntry(entry, owner);
    syncHistoryEntry(entry);
  }, [youtubeVideo, canRecord, owner]);

  return null;
}

export default SongsHistory