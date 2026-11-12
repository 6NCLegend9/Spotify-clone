"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector, useStore } from "react-redux";
import useAccountScope from "@/hooks/useAccountScope";
import { beginPlaybackRequest, replaceUpcomingYoutubeQueue } from "@/redux/features/playerSlice";
import { getSupabase, isSupabaseConfigured } from "@/utils/supabaseClient";
import { blendProfiles, buildRadioQueue, spreadByOwner } from "@/utils/radioEngine.mjs";
import { verifyCrowdProfiles, CROWD_PROFILE_TTL_MS, CROWD_PROFILE_REFRESH_MS } from "@/utils/crowdProfiles.mjs";
import { isJamCode } from "@/utils/jam.mjs";
import { requestJson } from "@/services/http";
import { userErrorDetails } from "@/utils/userError";

const STATION_LIMIT = 40;
const EMPTY_LIST = [];

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
  const accountScope = useAccountScope();
  const accountReady = accountScope.isCurrent();
  const youtubeVideo = useSelector((state) => state.player.youtubeVideo);

  const [participantId] = useState(() => `kc_${Math.random().toString(36).slice(2, 10)}`);
  const [roster, setMembers] = useState(null);
  const [stationResult, setStation] = useState(null);
  const [busyScope, setBusy] = useState(null);
  const [failure, setError] = useState(null);
  const pending = useRef(null);
  const authorization = useRef(null);

  const active = Boolean(enabled && isJamCode(code) && status === "connected");
  const roomScope = JSON.stringify([accountScope.key, code, role, status, enabled]);
  const requestKey = JSON.stringify([roomScope, youtubeVideo?.id, youtubeVideo?.queueEntryId]);
  const requestScope = useRef(null);
  if (requestScope.current?.key !== requestKey) requestScope.current = { key: requestKey };
  const members = roster?.scope === roomScope ? roster.value : EMPTY_LIST;
  const station = stationResult?.scope === roomScope ? stationResult.tracks : [];
  const owners = stationResult?.scope === roomScope ? stationResult.owners : [];
  const busy = busyScope === requestScope.current;
  const error = failure?.scope === roomScope ? failure.message : null;
  // Only the authenticated server can issue identity/taste claims. Refresh the
  // short-lived grant without rebuilding the channel; late work cannot revive it.
  useEffect(() => {
    if (!active || !accountReady || !isSupabaseConfigured()) return undefined;
    let cancelled = false, channel = null, supabase = null, grant = null;
    let refreshTimer, expiryTimer, rosterTimer, sequence = 0;
    const controller = new AbortController();
    let authority = null;
    const retire = () => {
      grant = null;
      if (authorization.current === authority) authorization.current = null;
      authority = null;
      clearTimeout(expiryTimer);
      sequence++;
      setMembers({ scope: roomScope, value: [] });
      if (channel && supabase) supabase.removeChannel(channel);
      channel = null;
    };
    const sync = async () => {
      const current = grant, revision = ++sequence;
      if (cancelled || !current || !channel) return;
      const envelopes = Object.values(channel.presenceState() || {}).flat().map(entry => entry?.envelope);
      const verified = await verifyCrowdProfiles(envelopes, current.publicKey, current.roomId);
      if (cancelled || revision !== sequence || grant !== current) return;
      setMembers({ scope: roomScope, value: verified.map(member => ({ ...member, isSelf: member.id === current.selfId })) });
    };
    const refresh = async () => {
      try {
        const next = await requestJson("/api/crowd-profile", { method: "POST", body: { code }, signal: controller.signal });
        const [self] = await verifyCrowdProfiles([next?.envelope], next?.publicKey, next?.roomId);
        if (cancelled) return;
        if (!self) throw new Error("Crowd identity could not be verified.");
        if (grant && grant.roomId !== next.roomId) retire();
        grant = { ...next, selfId: self.id };
        if (!authority) authority = { scope: roomScope };
        authorization.current = authority;
        clearTimeout(expiryTimer);
        expiryTimer = setTimeout(retire, Math.max(0, self.at + CROWD_PROFILE_TTL_MS - Date.now()));
        if (!channel) {
          supabase = await getSupabase();
          if (cancelled || !grant || !supabase) return;
          channel = supabase.channel(crowdChannelName(code), { config: { presence: { key: participantId } } });
          const subscribedChannel = channel;
          subscribedChannel.on("presence", { event: "sync" }, () => {
            if (channel === subscribedChannel) void sync();
          });
          subscribedChannel.subscribe(state => {
            if (!cancelled && grant && channel === subscribedChannel && state === "SUBSCRIBED") {
              void subscribedChannel.track({ envelope: grant.envelope }).catch(() => {
                if (!cancelled && channel === subscribedChannel) retire();
              });
            }
          });
        } else await channel.track({ envelope: grant.envelope });
      } catch (error) {
        if (cancelled) return;
        // Clear shared state on any failed renewal; no stale identity fallback.
        retire();
        setError({ scope: roomScope, message: userErrorDetails(error).message });
      } finally {
        if (!cancelled) refreshTimer = setTimeout(refresh, CROWD_PROFILE_REFRESH_MS);
      }
    };
    void refresh();
    rosterTimer = setInterval(() => {
      if (cancelled) return;
      setMembers(previous => {
        if (previous?.scope !== roomScope) return previous;
        const fresh = previous.value.filter(member => Date.now() - member.at <= CROWD_PROFILE_TTL_MS);
        return fresh.length === previous.value.length ? previous : { ...previous, value: fresh };
      });
    }, 1000);
    return () => {
      cancelled = true;
      if (authorization.current === authority) authorization.current = null;
      controller.abort();
      clearTimeout(refreshTimer); clearTimeout(expiryTimer); clearInterval(rosterTimer);
      if (channel && supabase) supabase.removeChannel(channel);
    };
  }, [accountReady, active, code, participantId, roomScope]);

  const buildStation = useCallback(async () => {
    const scope = requestScope.current;
    const authority = authorization.current;
    if (!authority || authority.scope !== roomScope || scope.key !== requestKey || !active || role !== "host"
      || !accountScope.isCurrent() || pending.current?.scope === scope) return;
    const player = store.getState().player;
    if (player.playbackOwner !== accountScope.owner || player.activeSong?.id) return;
    const { seeds } = blendProfiles(members);
    if (seeds.length === 0) {
      setError({ scope: roomScope, message: "Nobody in the room has shared any taste yet." });
      return;
    }
    // An idle Build requests playback. A refresh for an existing track only
    // replaces upcoming songs, so a later Pause must not discard that refresh.
    if (!player.youtubeVideo?.id) dispatch(beginPlaybackRequest());
    const expectedIntentRevision = store.getState().player.playbackIntentRevision;
    const request = { scope };
    pending.current = request;
    const isCurrent = () => authorization.current === authority && pending.current === request
      && requestScope.current === scope && accountScope.isCurrent()
      && (player.youtubeVideo?.id || store.getState().player.playbackIntentRevision === expectedIntentRevision);
    setBusy(scope);
    setError(null);
    try {
      const data = await requestJson("/api/crowd-radio", {
        method: "POST",
        body: { code, profiles: members.map(member => member.envelope) },
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
        expectedIntentRevision,
      }));
      // The reducer can reject a newer selection before this hook re-renders.
      if (store.getState().player !== before) setStation({ scope: roomScope, tracks: fair, owners: Array.isArray(data.owners) ? data.owners : [] });
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
