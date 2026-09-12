import {
  playPause,
  setActiveSong,
  setFullScreen,
  startYoutubePlayback,
} from "@/redux/features/playerSlice";
import { buildRadioQueue } from "@/utils/radioEngine.mjs";

function isYoutubeTrack(track) {
  if (!track) return false;
  if (track.source === "youtube") return true;
  if (track.source && track.source !== "youtube") return false;
  return Boolean(track.channel || track.thumbnail);
}

export function playHomeTracks(dispatch, tracks, startIndex = 0) {
  const list = (Array.isArray(tracks) ? tracks : []).filter((track) => track?.id);
  if (!list.length) return;

  const start = list[Math.max(0, Math.min(startIndex, list.length - 1))];
  if (isYoutubeTrack(start)) {
    const youtubeList = list.filter(isYoutubeTrack);
    const seedQuery = start.seedQuery || start.genre;
    const tuned = buildRadioQueue({
      seedTrack: start,
      candidates: youtubeList,
      varietyLevel: "med",
      selectionDepth: "discover",
      limit: youtubeList.length || 50,
    });
    const seededQueue = [start, ...tuned.filter((track) => track?.id !== start.id)].map((item) => ({
      ...item,
      seedQuery: item.seedQuery || item.genre || seedQuery,
      genre: item.genre || start.genre,
    }));
    dispatch(startYoutubePlayback({ queue: seededQueue, track: { ...start, seedQuery, genre: start.genre || seedQuery } }));
    return;
  }

  dispatch(setActiveSong({ song: start, data: list, i: list.indexOf(start) }));
  dispatch(setFullScreen(true));
  dispatch(playPause(true));
}
