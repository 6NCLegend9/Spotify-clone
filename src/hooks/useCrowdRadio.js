"use client";

import { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useSession } from "next-auth/react";
import { playPause, setYoutubeQueue, setYoutubeVideo } from "@/redux/features/playerSlice";
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
 * Kasa Crowd: every listener in a Jam publishes a small taste profile on a
 * dedicated presence channel, and the host blends them into one shared station.
 *
 * This deliberately runs on its own channel so the Jam playback sync is
 * untouched — the host simply dispatches the blended queue and the existing Jam
 * snapshot broadcast carries it to everyone else.
 */
export default function useCrowdRadio({ code, role, status, enabled = true }) {
  const dispatch = useDispatch();
  const { data: authSession, status: authStatus } = useSession();
  const youtubeVideo = useSelector((state) => state.player.youtubeVideo);

  const [participantId] = useState(() => `kc_${Math.random().toString(36).slice(2, 10)}`);
  const [taste, setTaste] = useState(null);
  const [members, setMembers] = useState([]);
  const [station, setStation] = useState([]);
  const [owners, setOwners] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const active = Boolean(enabled && isJamCode(code) && status === "connected");
  const displayName =
    authSession?.user?.name || authSession?.user?.email?.split("@")[0] || "Listener";

  // Load this listener's own taste once; both endpoints are cheap and cached.
  useEffect(() => {
    if (!active || authStatus !== "authenticated" || taste) return undefined;
    let cancelled = false;
    (async () => {
      const [settings, followed] = await Promise.allSettled([
        requestJson("/api/settings", { fallbackTitle: "Taste unavailable" }),
        requestJson("/api/followedArtists", { fallbackTitle: "Artists unavailable" }),
      ]);
      if (cancelled) return;
      setTaste({
        genres: shortTerms(settings.status === "fulfilled" ? settings.value?.genres : [], MAX_SHARED_GENRES),
        artists: shortTerms(followed.status === "fulfilled" ? followed.value?.data : [], MAX_SHARED_ARTISTS),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [active, authStatus, taste]);

  // Share taste and read the room's roster over a Kasa Crowd-only channel.
  useEffect(() => {
    if (!active || !taste || !isSupabaseConfigured()) return undefined;
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
        setMembers([...seen.values()]);
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
  }, [active, code, displayName, participantId, taste]);

  const buildStation = useCallback(async () => {
    if (role !== "host" || !isJamCode(code) || busy) return;
    const { seeds, owners: blended } = blendProfiles(members);
    if (seeds.length === 0) {
      setError("Nobody in the room has shared any taste yet.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await requestJson("/api/crowd-radio", {
        method: "POST",
        body: { code, seeds },
        fallbackTitle: "Kasa Crowd unavailable",
        fallbackMessage: "We couldn't build the room's station. Please try again.",
      });
      // Rank for quality first, then interleave so nobody's taste gets buried.
      const ranked = buildRadioQueue({
        candidates: Array.isArray(data?.tracks) ? data.tracks : [],
        varietyLevel: "high",
        selectionDepth: "discover",
        limit: 0,
      });
      const fair = spreadByOwner(ranked, { limit: STATION_LIMIT });
      if (fair.length === 0) {
        setError("No playable tracks came back. Try again in a moment.");
        return;
      }
      setStation(fair);
      setOwners(blended);
      dispatch(setYoutubeQueue(fair));
      // Never interrupt whatever the host already has playing.
      if (!youtubeVideo?.id) {
        dispatch(setYoutubeVideo(fair[0]));
        dispatch(playPause(true));
      }
    } catch (requestError) {
      setError(userErrorDetails(requestError).message);
    } finally {
      setBusy(false);
    }
  }, [busy, code, dispatch, members, role, youtubeVideo?.id]);

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
