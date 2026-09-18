"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useJam } from "@/components/Jam/JamProvider";
import { setYoutubeVideo } from "@/redux/features/playerSlice";
import { requestJson } from "@/services/http";
import { canonicalSongIdentity } from "@/utils/songIdentity.mjs";
import {
  buildTrackCutQuery,
  classifyTrackCut,
  isTrackCut,
  preferredTrackCut,
  rankTrackCutResults,
  writeTrackCutPreference,
} from "@/utils/trackCut.mjs";

export default function useTrackCut() {
  const dispatch = useDispatch();
  const jam = useJam();
  const video = useSelector((state) => state.player.youtubeVideo);
  const identity = canonicalSongIdentity(video);
  const currentCut = classifyTrackCut(video);
  const jamGuest = jam?.role === "guest" && Boolean(jam.code);
  const [busy, setBusy] = useState("");
  const appliedRef = useRef("");
  const videoRef = useRef(video);
  videoRef.current = video;

  const selectCut = useCallback(async (cut) => {
    const track = videoRef.current;
    const key = canonicalSongIdentity(track);
    if (jamGuest || !track?.id || !isTrackCut(cut)) return;
    writeTrackCutPreference(window.localStorage, key, cut);
    if (classifyTrackCut(track) === cut) return;
    setBusy(cut);
    try {
      const query = buildTrackCutQuery(track, cut);
      const data = await requestJson(`/api/youtube-search?type=video&q=${encodeURIComponent(query)}`, {
        fallbackTitle: "That cut is unavailable",
        fallbackMessage: "We couldn’t find that version. Try another cut.",
      });
      const ranked = rankTrackCutResults(data?.results, cut, query);
      const next = ranked.find((item) => item?.id);
      if (next?.id && next.id !== track.id) {
        dispatch(setYoutubeVideo({
          ...track,
          id: next.id,
          title: next.title || track.title,
          channel: next.channel || track.channel,
          thumbnail: next.thumbnail || track.thumbnail,
        }));
      }
    } finally {
      setBusy("");
    }
  }, [dispatch, jamGuest]);

  useEffect(() => {
    if (jamGuest || !identity || appliedRef.current === identity) return;
    appliedRef.current = identity;
    const preferred = preferredTrackCut(video, window.localStorage);
    if (preferred !== classifyTrackCut(video)) void selectCut(preferred);
  }, [identity, jamGuest, selectCut, video]);

  return { currentCut, busy, selectCut, available: Boolean(video?.id) };
}
