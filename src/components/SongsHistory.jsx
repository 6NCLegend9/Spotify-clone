'use client';
import { useEffect } from 'react';
import { useSelector } from 'react-redux';

const pushHistoryEntry = (entry) => {
  const storedSongHistory = localStorage?.getItem("songHistory");
  const parsedSongHistory = storedSongHistory ? JSON.parse(storedSongHistory) : [];
  const updatedHistory = parsedSongHistory.filter((song) => song?.id !== entry.id);
  if (updatedHistory.length >= 9) updatedHistory.pop();
  localStorage.setItem("songHistory", JSON.stringify([entry, ...updatedHistory]));
};

const SongsHistory = () => {
  const { activeSong, youtubeVideo } = useSelector((state) => state.player);

  useEffect(() => {
    if (activeSong?.name) pushHistoryEntry(activeSong);
  }, [activeSong]);

  // YouTube is the primary playback path now; without this, "Listen Again" never records real usage.
  useEffect(() => {
    if (youtubeVideo?.id) {
      pushHistoryEntry({
        source: "youtube",
        id: youtubeVideo.id,
        title: youtubeVideo.title,
        channel: youtubeVideo.channel,
        thumbnail: youtubeVideo.thumbnail,
      });
    }
  }, [youtubeVideo]);

  return null;
}

export default SongsHistory