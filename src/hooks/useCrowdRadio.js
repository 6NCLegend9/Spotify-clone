"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector, useStore } from "react-redux";
import { useSession } from "next-auth/react";
import useAccountScope from "@/hooks/useAccountScope";
import { replaceUpcomingYoutubeQueue } from "@/redux/features/playerSlice";
import { getSupabase, isSupabaseConfigured } from "@/utils/supabaseClient";
import { blendProfiles, buildRadioQueue, spreadByOwner } from "@/utils/radioEngine.mjs";
import { isJamCode } from "@/utils/jam.mjs";
import { requestJson } from "@/services/http";
import { userErrorDetails } from "@/utils/userError";

// Presence payloads stay small: only a handful of short terms per listener.
const MAX_SHARED_GENRES = 5;
const MAX_SHARED_ARTISTS = 5;
const MAX_TERM_CHARS = 60;
const STATION_LIMIT = 40;
const EMPTY_LIST = [];

function shortTerms(values, max) {
  return (Array.isArray(values) ? values : [])
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => value.trim().slice(0, MAX_TERM_CHARS))
    .slice(0, max);
}

function crowdChannelName(code) {
  return `heykasa:crowd:${code}`;
}

/**
 * HayKasa Crowd: every listener in a Jam publishes a small taste profile on a
 * dedicated presence channel, and the host blends them into one shared station.
 *
 * This deliberately runs on its own channel so the Jam playback sync is
 * untouched — the host simply dispatches the blended queue and the existing Jam
 * snapshot broadcast carries it to everyone else.
 */
export default function useCrowdRadio({ code, role, status, enabled = true }) {
  const dispatch = useDispatch();
  const store = useStore();
  const { data: authSession } = useSession();
  const accountScope = useAccountScope();
  const accountReady = accountScope.isCurrent();
  const youtubeVideo = useSelector((state) => state.player.youtubeVideo);

  const [participantId] = useState(() => `kc_${Math.random().toString(36).slice(2, 10)}`);
  const [tasteResult, setTaste] = useState(null);
  const [roster, setMembers] = useState(null);
  const [stationResult, setStation] = useState(null);
  const [busyScope, setBusy] = useState(null);
  const [failure, setError] = useState(null);
  const pending = useRef(null);

  const active = Boolean(enabled && isJamCode(code) && status === "connected");
  const roomScope = JSON.stringify([accountScope.key, code, role, status, enabled]);
  const requestKey = JSON.stringify([roomScope, youtubeVideo?.id, youtubeVideo?.queueEntryId]);
  const requestScope = useRef(null);
  if (requestScope.current?.key !== requestKey) requestScope.current = { key: requestKey };
  const taste = tasteResult?.scope === accountScope.key ? tasteResult.value : null;
  const members = roster?.scope === roomScope ? roster.value : EMPTY_LIST;
  const station = stationResult?.scope === roomScope ? stationResult.tracks : [];
  const owners = stationResult?.scope === roomScope ? stationResult.owners : [];
  const busy = busyScope === requestScope.current;
  const error = failure?.scope === roomScope ? failure.message : null;
  const displayName =
    authSession?.user?.name || authSession?.user?.email?.split("@")[0] || "Listener";

  // Load this listener's own taste once; both endpoints are cheap and cached.
  useEffect(() => {
    if (!active || !accountReady || taste) return undefined;
    let cancelled = false;
    (async () => {
      const [settings, followed] = await Promise.allSettled([
        requestJson("/api/settings", { fallbackTitle: "Taste unavailable" }),
        requestJson("/api/followedArtists", { fallbackTitle: "Artists unavailable" }),
      ]);
      if (cancelled) return;
      setTaste({ scope: accountScope.key, value: {
        genres: shortTerms(settings.status === "fulfilled" ? settings.value?.genres : [], MAX_SHARED_GENRES),
        artists: shortTerms(followed.status === "fulfilled" ? followed.value?.data : [], MAX_SHARED_ARTISTS),
      } });
    })();
    return () => {
      cancelled = true;
    };
  }, [accountScope.key, accountReady, active, taste]);

  // Share taste and read the room's roster over a HayKasa Crowd-only channel.
  useEffect(() => {
    if (!active || !accountReady || !taste || !isSupabaseConfigured()) return undefined;
    let cancelled = false;
    let channel = null;
    let supabaseRef = null;

    (async () => {
      const supabase = await getSupabase();
      if (!supabase || cancelled) return;
      supabaseRef = supabase;
      channel = supabase.channel(crowdChannelName(code), {
        config: { presence: { key: participantId } },
      });

      channel.on("presence", { event: "sync" }, () => {
        if (cancelled) return;
        const seen = new Map();
        for (const entry of Object.values(channel.presenceState() || {}).flat()) {
          if (!entry?.id || seen.has(entry.id)) continue;
          seen.set(entry.id, {
            id: entry.id,
            name: entry.name || "Listener",
            genres: Array.isArray(entry.genres) ? entry.genres : [],
            artists: Array.isArray(entry.artists) ? entry.artists : [],
            isSelf: entry.id === participantId,
          });
        }
        setMembers({ scope: roomScope, value: [...seen.values()] });
      });

      channel.subscribe((state) => {
        if (cancelled || state !== "SUBSCRIBED") return;
        void channel.track({
          id: participantId,
          name: displayName,
          genres: taste.genres,
          artists: taste.artists,
        });
      });
    })();

    return () => {
      cancelled = true;
      if (channel && supabaseRef) supabaseRef.removeChannel(channel);
    };
  }, [accountReady, active, code, displayName, participantId, roomScope, taste]);

  const buildStation = useCallback(async () => {
    const scope = requestScope.current;
    if (scope.key !== requestKey || !active || role !== "host"
      || !accountScope.isCurrent() || pending.current?.scope === scope) return;
    const player = store.getState().player;
    if (player.playbackOwner !== accountScope.owner || player.activeSong?.id) return;
    const { seeds, owners: blended } = blendProfiles(members);
    if (seeds.length === 0) {
      setError({ scope: roomScope, message: "Nobody in the room has shared any taste yet." });
      return;
    }
    const request = { scope };
    pending.current = request;
    const isCurrent = () => pending.current === request
      && requestScope.current === scope && accountScope.isCurrent();
    setBusy(scope);
    setError(null);
    try {
      const data = await requestJson("/api/crowd-radio", {
        method: "POST",
        body: { code, seeds },
        fallbackTitle: "HayKasa Crowd unavailable",
        fallbackMessage: "We couldn't build the room's station. Please try again.",
      });
      if (!isCurrent()) return;
      // Rank for quality first, then interleave so nobody's taste gets buried.
      const ranked = buildRadioQueue({
        candidates: Array.isArray(data?.tracks) ? data.tracks : [],
        varietyLevel: "high",
        selectionDepth: "discover",
        limit: 0,
      });
      const fair = spreadByOwner(ranked, { limit: STATION_LIMIT });
      if (fair.length === 0) {
        setError({ scope: roomScope, message: "No playable tracks came back. Try again in a moment." });
        return;
      }
      const before = store.getState().player;
      dispatch(replaceUpcomingYoutubeQueue({
        tracks: fair,
        expectedCurrent: player.youtubeVideo,
        expectedOwner: player.playbackOwner,
      }));
      // The reducer can reject a newer selection before this hook re-renders.
      if (store.getState().player !== before) setStation({ scope: roomScope, tracks: fair, owners: blended });
    } catch (requestError) {
      if (isCurrent()) setError({ scope: roomScope, message: userErrorDetails(requestError).message });
    } finally {
      if (pending.current === request) {
        pending.current = null;
        setBusy(null);
      }
    }
  }, [accountScope, active, code, dispatch, members, requestKey, role, roomScope, store]);

  return {
    supported: isSupabaseConfigured(),
    active,
    members,
    owners,
    station,
    busy,
    error,
    buildStation,
  };
}
