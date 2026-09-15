import {
  playPause,
  setActiveSong,
  setFullScreen,
  startYoutubePlayback,
} from "@/redux/features/playerSlice";
import { cleanArtist, cleanTitle } from "@/utils/text";

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
    const artist = cleanArtist(start.channel);
    const title = cleanTitle(start.title || start.name);
    const seedQuery = start.seedQuery || start.genre || [artist, title].filter(Boolean).join(" ");
    const radioTrack = {
      ...start,
      channel: artist || start.channel,
      seedQuery,
      genre: start.genre || artist || seedQuery,
    };
    dispatch(startYoutubePlayback({
      queue: [radioTrack],
      track: radioTrack,
      queueMode: "radio",
      context: {
        type: "radio",
        id: String(start.id),
        name: artist ? `${artist} Radio` : `${title || "Track"} Radio`,
      },
    }));
    return;
  }

  // Legacy non-YouTube fallback remains until its final callers are migrated.
  dispatch(setActiveSong({ song: start, data: list, i: list.indexOf(start) }));
  dispatch(setFullScreen(true));
  dispatch(playPause(true));
}
