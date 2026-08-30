'use client';
import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useSession } from 'next-auth/react';

const pushHistoryEntry = (entry) => {
  const storedSongHistory = localStorage?.getItem("songHistory");
  const parsedSongHistory = storedSongHistory ? JSON.parse(storedSongHistory) : [];
  const updatedHistory = parsedSongHistory.filter((song) => song?.id !== entry.id);
  if (updatedHistory.length >= 9) updatedHistory.pop();
  localStorage.setItem("songHistory", JSON.stringify([entry, ...updatedHistory]));
};

// Best-effort sync to the server so history follows the account across devices/browsers.
// Never blocks or breaks local history tracking if it fails (offline, logged out, etc.).
const syncHistoryEntry = (entry) => {
  fetch("/api/history", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entry }),
  }).catch(() => {});
};

const SongsHistory = () => {
  const { activeSong, youtubeVideo } = useSelector((state) => state.player);
  const { status } = useSession();
  const isAuthenticated = status === "authenticated";

  useEffect(() => {
    if (activeSong?.name) {
      pushHistoryEntry(activeSong);
      if (isAuthenticated) syncHistoryEntry(activeSong);
    }
  }, [activeSong, isAuthenticated]);

  // YouTube is the primary playback path now; without this, "Listen Again" never records real usage.
  useEffect(() => {
    if (youtubeVideo?.id) {
      const entry = {
        source: "youtube",
        id: youtubeVideo.id,
        title: youtubeVideo.title,
        channel: youtubeVideo.channel,
        thumbnail: youtubeVideo.thumbnail,
      };
      pushHistoryEntry(entry);
      if (isAuthenticated) syncHistoryEntry(entry);
    }
  }, [youtubeVideo, isAuthenticated]);

  return null;
}

export default SongsHistory