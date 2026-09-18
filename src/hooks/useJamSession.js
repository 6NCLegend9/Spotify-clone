"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useSession } from "next-auth/react";
import { toast } from "react-hot-toast";
import {
  setYoutubeVideo,
  setYoutubeQueue,
  playPause,
  appendToQueue,
} from "@/redux/features/playerSlice";
import { signedJamChannel } from "@/utils/jamSignedChannel.mjs";
import { getSupabase, isSupabaseConfigured } from "@/utils/supabaseClient";
import {
  HOST_RECONNECT_GRACE_MS,
  JAM_AUX_SKIP_EVENT,
  JAM_HEARTBEAT_MS,
  JAM_PLAYBACK_STATE_EVENT,
  JAM_REMOTE_PLAYBACK_EVENT,
  JAM_REMOTE_SEEK_EVENT,
  clearJamSession,
  isJamCode,
  jamChannelName,
  jamCodeFromPath,
  makeJamCode,
  normalizeJamCode,
  projectJamPlaybackTime,
  readJamSession,
  shouldExpireEmptyJam,
  writeJamSession,
} from "@/utils/jam.mjs";
import {
  AUX_SONG_LIMIT,
  canControlAux,
  consumeAuxSkip,
  createAuxGrant,
  sanitizeAuxState,
} from "@/utils/jamAux.mjs";
import { sanitizeArcadeScore } from "@/utils/jamRooms.mjs";

function presenceList(channel) {
  return Object.values(channel?.presenceState?.() || {}).flat();
}

function hostPresence(channel) {
  return presenceList(channel).find((entry) => (
    entry?.role === "host"
    && !shouldExpireEmptyJam({
      role: "host",
      startedAt: Number(entry.startedAt),
      guestJoined: Boolean(entry.guestJoined),
      persistent: Boolean(entry.persistent),
    })
  ));
}

function hasHostPresence(channel) {
  return Boolean(hostPresence(channel));
}

export default function useJamSession() {
  const dispatch = useDispatch();
  const { data: authSession, status: authStatus } = useSession();
  const { youtubeVideo, youtubeQueue, isPlaying } = useSelector((state) => state.player);

  const [role, setRole] = useState(null);
  const [code, setCode] = useState("");
  const [listeners, setListeners] = useState([]);
  const [people, setPeople] = useState([]);
  const [aux, setAux] = useState(null);
  const [status, setStatus] = useState("idle");
  const [persistent, setPersistent] = useState(false);
  const [name, setName] = useState("");
  const [rooms, setRooms] = useState([]);
  const [scores, setScores] = useState([]);

  const channelRef = useRef(null);
  const supabaseRef = useRef(null);
  const applyingRemoteRef = useRef(false);
  const playerStateRef = useRef({ youtubeVideo, youtubeQueue, isPlaying });
  const startedAtRef = useRef(0);
  const guestJoinedRef = useRef(false);
  const roleRef = useRef(null);
  const restoredRef = useRef(false);
  const connectAttemptRef = useRef(0);
  const guestCountRef = useRef(0);
  const playbackPositionRef = useRef(null);
  const endingRef = useRef(false);
  const membersRef = useRef(new Map());
  const auxRef = useRef(null);
  const lastHostSeenAtRef = useRef(0);
  const persistentRef = useRef(false);
  const nameRef = useRef("");
  const participantKeyRef = useRef(
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
  );

  useEffect(() => {
    playerStateRef.current = { youtubeVideo, youtubeQueue, isPlaying };
  }, [youtubeVideo, youtubeQueue, isPlaying]);

  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  useEffect(() => {
    const updatePosition = (event) => {
      const position = event.detail;
      if (!position?.videoId || !Number.isFinite(position.currentTime)) return;
      playbackPositionRef.current = position;
    };
    window.addEventListener(JAM_PLAYBACK_STATE_EVENT, updatePosition);
    return () => window.removeEventListener(JAM_PLAYBACK_STATE_EVENT, updatePosition);
  }, []);

  const displayName =
    authSession?.user?.name || authSession?.user?.email?.split("@")[0] || "Listener";

  const persist = useCallback((next) => {
    writeJamSession({
      code: next.code,
      role: next.role,
      startedAt: startedAtRef.current,
      guestJoined: guestJoinedRef.current,
      participantId: participantKeyRef.current,
      persistent: persistentRef.current,
      name: nameRef.current,
    });
  }, []);

  const publishMembers = useCallback(() => {
    const members = [...membersRef.current.values()]
      .sort((left, right) => (
        Number(right.role === "host") - Number(left.role === "host")
        || left.name.localeCompare(right.name)
      ));
    setPeople(members);
    setListeners(members.map((member) => member.name));
  }, []);

  const rememberMember = useCallback((member) => {
    if (!member?.participantId || (member.role !== "host" && member.role !== "guest")) {
      return;
    }
    const name = member.name || "Listener";
    const previous = membersRef.current.get(member.participantId);
    membersRef.current.set(member.participantId, {
      participantId: member.participantId,
      role: member.role,
      name,
      seenAt: Date.now(),
    });
    if (member.role === "host") lastHostSeenAtRef.current = Date.now();
    if (!previous || previous.role !== member.role || previous.name !== name) {
      publishMembers();
    }
  }, [publishMembers]);

  const applySync = useCallback(
    (payload) => {
      if (!payload) return;
      applyingRemoteRef.current = true;
      const current = playerStateRef.current;
      const nextTrack = payload.track?.id ? payload.track : null;
      const trackChanged = nextTrack?.id !== current.youtubeVideo?.id;
      const nextQueue = Array.isArray(payload.queue)
        ? payload.queue
        : current.youtubeQueue;
      const nextPlaying = typeof payload.isPlaying === "boolean"
        ? payload.isPlaying
        : current.isPlaying;

      if (Array.isArray(payload.queue)) dispatch(setYoutubeQueue(nextQueue));
      if (trackChanged) dispatch(setYoutubeVideo(nextTrack));
      // setYoutubeVideo intentionally starts a selected track, so apply the
      // host's paused state afterwards when a guest joins a paused Jam.
      if (nextPlaying !== current.isPlaying || trackChanged) {
        dispatch(playPause(nextPlaying));
      }
      if ("aux" in payload) {
        const nextAux = sanitizeAuxState(payload.aux);
        auxRef.current = nextAux;
        setAux(nextAux);
      }
      playerStateRef.current = {
        youtubeVideo: nextTrack,
        youtubeQueue: nextQueue,
        isPlaying: nextPlaying,
      };

      if (nextTrack?.id) {
        window.dispatchEvent(new CustomEvent(JAM_REMOTE_PLAYBACK_EVENT, {
          detail: { videoId: nextTrack.id, isPlaying: nextPlaying },
        }));
      }

      const position = payload.position;
      if (
        nextTrack?.id
        && position?.videoId === nextTrack.id
        && Number.isFinite(Number(position.currentTime))
      ) {
        const targetTime = projectJamPlaybackTime(
          position.currentTime,
          nextPlaying,
          payload.at,
        );
        window.dispatchEvent(new CustomEvent(JAM_REMOTE_SEEK_EVENT, {
          detail: { videoId: nextTrack.id, currentTime: targetTime },
        }));
      }
      window.setTimeout(() => {
        applyingRemoteRef.current = false;
      }, 0);
    },
    [dispatch],
  );

  const disconnectChannel = useCallback(() => {
    guestCountRef.current = 0;
    const supabase = supabaseRef.current;
    const channel = channelRef.current;
    channelRef.current = null;
    if (channel && supabase) void supabase.removeChannel(channel.__raw || channel);
  }, []);

  const resetLocal = useCallback(() => {
    connectAttemptRef.current += 1;
    endingRef.current = false;
    disconnectChannel();
    membersRef.current.clear();
    auxRef.current = null;
    lastHostSeenAtRef.current = 0;
    startedAtRef.current = 0;
    guestJoinedRef.current = false;
    roleRef.current = null;
    persistentRef.current = false;
    nameRef.current = "";
    clearJamSession();
    setRole(null);
    setCode("");
    setListeners([]);
    setPeople([]);
    setAux(null);
    setPersistent(false);
    setName("");
    setScores([]);
    setStatus("idle");
  }, [disconnectChannel]);

  const sendSnapshot = useCallback((channel = channelRef.current) => {
    if (!channel) return Promise.resolve("error");
    const snapshot = playerStateRef.current;
    const position = playbackPositionRef.current?.videoId === snapshot.youtubeVideo?.id
      ? playbackPositionRef.current
      : null;
    return channel.send({
      type: "broadcast",
      event: "sync",
      payload: {
        track: snapshot.youtubeVideo,
        queue: snapshot.youtubeQueue,
        isPlaying: snapshot.isPlaying,
        position,
        aux: auxRef.current,
        at: Date.now(),
      },
    });
  }, []);

  const publishAux = useCallback((next) => {
    const sanitized = sanitizeAuxState(next);
    auxRef.current = sanitized;
    setAux(sanitized);
    const channel = channelRef.current;
    if (channel && roleRef.current === "host") {
      void channel.send({
        type: "broadcast",
        event: "aux",
        payload: { aux: sanitized },
      });
    }
    return sanitized;
  }, []);

  const leave = useCallback(async () => {
    const channel = channelRef.current;
    if (channel) {
      try {
        await Promise.race([
          channel.send({
            type: "broadcast",
            event: "member-left",
            payload: { participantId: participantKeyRef.current },
          }),
          new Promise((resolve) => window.setTimeout(resolve, 500)),
        ]);
      } catch {
        // Stale members are pruned by heartbeat if this final event cannot send.
      }
    }
    resetLocal();
  }, [resetLocal]);

  const endJam = useCallback(
    async (message) => {
      if (endingRef.current) return;
      endingRef.current = true;
      const channel = channelRef.current;
      if (channel) {
        try {
          await Promise.race([
            channel.send({
              type: "broadcast",
              event: "ended",
              payload: persistentRef.current
                ? {
                  queue: playerStateRef.current.youtubeQueue,
                  track: playerStateRef.current.youtubeVideo,
                }
                : {},
            }),
            new Promise((resolve) => window.setTimeout(resolve, 1000)),
          ]);
        } catch {
          // Presence loss is the fallback if the final broadcast cannot send.
        }
      }
      resetLocal();
      if (message) toast(message);
    },
    [resetLocal],
  );

  const connect = useCallback(
    async (roomCode, asRole, { startedAt, guestJoined, create = false, name: roomName } = {}) => {
      if (authStatus !== "authenticated") {
        setStatus("idle");
        return;
      }
      let nextCode = normalizeJamCode(roomCode);
      if (!isJamCode(nextCode) || (asRole !== "host" && asRole !== "guest")) {
        setStatus("error");
        return;
      }

      const attempt = connectAttemptRef.current + 1;
      connectAttemptRef.current = attempt;
      disconnectChannel();
      membersRef.current.clear();
      auxRef.current = null;
      setAux(null);
      setPeople([]);
      setListeners([]);
      startedAtRef.current = startedAt || Date.now();
      guestJoinedRef.current = Boolean(guestJoined);
      roleRef.current = asRole;
      setRole(asRole);
      setCode(nextCode);
      setStatus("connecting");

      let supabase;
      let grant;
      try {
        const response = await fetch("/api/jam", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: create ? "create" : "join",
            code: nextCode,
            ...(create && roomName ? { name: roomName } : {}),
          }),
        });
        const json = await response.json();
        if (!response.ok || !json.data?.publicKey) throw new Error("Jam authorization failed");
        grant = json.data;
        if (attempt !== connectAttemptRef.current) return;
        nextCode = grant.code;
        asRole = grant.role;
        startedAtRef.current = grant.startedAt;
        participantKeyRef.current = authSession?.user?.id;
        persistentRef.current = Boolean(grant.persistent);
        nameRef.current = grant.name || "";
        roleRef.current = asRole;
        setRole(asRole);
        setCode(nextCode);
        setPersistent(persistentRef.current);
        setName(nameRef.current);
        setScores([]);
        if (asRole === "host" && grant.restored) {
          applySync({
            track: grant.track || null,
            queue: Array.isArray(grant.queue) ? grant.queue : [],
            isPlaying: false,
          });
        }
        supabase = await getSupabase();
      } catch {
        if (attempt === connectAttemptRef.current) {
          resetLocal();
          setStatus("error");
        }
        return;
      }
      if (attempt !== connectAttemptRef.current) return;
      if (!supabase) {
        resetLocal();
        setStatus("error");
        return;
      }
      supabaseRef.current = supabase;

      const rawChannel = supabase.channel(jamChannelName(nextCode), {
        config: {
          broadcast: { self: false },
          presence: { key: `${asRole}:${participantKeyRef.current}` },
        },
      });
      let channel;
      try {
        channel = await signedJamChannel(rawChannel, grant);
      } catch {
        void supabase.removeChannel(rawChannel);
        if (attempt === connectAttemptRef.current) { resetLocal(); setStatus("error"); }
        return;
      }
      if (attempt !== connectAttemptRef.current) { void supabase.removeChannel(rawChannel); return; }
      channelRef.current = channel;
      const isCurrent = () => (
        attempt === connectAttemptRef.current
        && channelRef.current === channel
      );
      const joinRequestId = `${participantKeyRef.current}-${Date.now().toString(36)}`;
      let hostAcknowledged = false;

      const waitForHost = async () => {
        if (hostAcknowledged || hasHostPresence(channel)) return true;
        const deadline = Date.now() + HOST_RECONNECT_GRACE_MS;
        while (isCurrent() && Date.now() < deadline) {
          await new Promise((resolve) => window.setTimeout(resolve, 250));
          if (hostAcknowledged || hasHostPresence(channel)) return true;
        }
        return false;
      };

      channel
        .on("broadcast", { event: "sync" }, ({ payload }) => {
          if (isCurrent() && asRole === "guest") {
            lastHostSeenAtRef.current = Date.now();
            applySync(payload);
          }
        })
        .on("broadcast", { event: "sync-request" }, () => {
          if (isCurrent() && asRole === "host") void sendSnapshot(channel);
        })
        .on("broadcast", { event: "join-request" }, ({ payload }) => {
          if (!isCurrent() || asRole !== "host" || !payload?.requestId) return;
          if (shouldExpireEmptyJam({
            role: "host",
            startedAt: startedAtRef.current,
            guestJoined: guestJoinedRef.current,
            persistent: persistentRef.current,
          })) {
            void endJam("Jam ended — nobody joined within 10 minutes.");
            return;
          }
          if (!guestJoinedRef.current) {
            guestJoinedRef.current = true;
            void channel.track({
              name: displayName,
              role: asRole,
              participantId: participantKeyRef.current,
              startedAt: startedAtRef.current,
              guestJoined: true,
              persistent: persistentRef.current,
            });
            persist({ code: nextCode, role: asRole });
          }
          rememberMember({
            participantId: payload.participantId,
            role: "guest",
            name: payload.name,
          });
          void channel.send({
            type: "broadcast",
            event: "join-accept",
            payload: {
              requestId: payload.requestId,
              participantId: participantKeyRef.current,
              role: "host",
              name: displayName,
            },
          });
          void sendSnapshot(channel);
        })
        .on("broadcast", { event: "join-accept" }, ({ payload }) => {
          if (
            isCurrent()
            && asRole === "guest"
            && payload?.requestId === joinRequestId
          ) {
            hostAcknowledged = true;
            lastHostSeenAtRef.current = Date.now();
            rememberMember(payload);
          }
        })
        .on("broadcast", { event: "heartbeat" }, ({ payload }) => {
          if (!isCurrent()) return;
          rememberMember(payload);
          if (asRole === "host" && payload?.role === "guest" && !guestJoinedRef.current) {
            guestJoinedRef.current = true;
            persist({ code: nextCode, role: asRole });
          }
        })
        .on("broadcast", { event: "member-left" }, ({ payload }) => {
          if (!isCurrent() || !payload?.participantId) return;
          membersRef.current.delete(payload.participantId);
          publishMembers();
          if (asRole === "host" && auxRef.current?.holderId === payload.participantId) {
            publishAux(null);
            toast("Aux is back with the host.");
          }
        })
        .on("broadcast", { event: "enqueue" }, ({ payload }) => {
          if (isCurrent() && payload?.track?.id) {
            dispatch(appendToQueue([payload.track]));
          }
        })
        .on("broadcast", { event: "aux" }, ({ payload }) => {
          if (!isCurrent()) return;
          const nextAux = sanitizeAuxState(payload?.aux);
          auxRef.current = nextAux;
          setAux(nextAux);
        })
        .on("broadcast", { event: "aux-control" }, ({ payload }) => {
          if (!isCurrent() || asRole !== "host" || payload?.action !== "skip") return;
          const holderId = payload.participantId;
          if (!canControlAux(auxRef.current, holderId)) return;
          const nextAux = consumeAuxSkip(auxRef.current, holderId);
          publishAux(nextAux);
          window.dispatchEvent(new Event(JAM_AUX_SKIP_EVENT));
          if (!nextAux) toast("Aux is back with the host.");
        })
        .on("broadcast", { event: "arcade-score" }, ({ payload }) => {
          if (!isCurrent()) return;
          const score = sanitizeArcadeScore(payload);
          setScores((current) => [score, ...current].slice(0, 8));
          if (payload?.participantId && payload.participantId !== participantKeyRef.current) {
            toast(`${score.name} scored ${score.score.toLocaleString()} on Beat Arcade`);
          }
        })
        .on("broadcast", { event: "ended" }, () => {
          if (isCurrent() && roleRef.current === "guest") {
            resetLocal();
            toast("This Jam has ended.");
          }
        })
        .on("presence", { event: "sync" }, () => {
          if (!isCurrent()) return;
          const people = presenceList(channel);
          people.forEach(rememberMember);

          if (asRole === "host") {
            const guestCount = people.filter((entry) => entry?.role === "guest").length;
            if (shouldExpireEmptyJam({
              role: "host",
              startedAt: startedAtRef.current,
              guestJoined: guestJoinedRef.current,
              persistent: persistentRef.current,
            })) {
              void endJam("Jam ended — nobody joined within 10 minutes.");
              return;
            }
            if (guestCount > guestCountRef.current) void sendSnapshot(channel);
            if (guestCount === 0 && guestCountRef.current > 0) {
              guestJoinedRef.current = false;
              startedAtRef.current = Date.now();
              void channel.track({
                name: displayName,
                role: asRole,
                participantId: participantKeyRef.current,
                startedAt: startedAtRef.current,
                guestJoined: false,
                persistent: persistentRef.current,
              });
              persist({ code: nextCode, role: asRole });
            }
            guestCountRef.current = guestCount;
            if (guestCount > 0 && !guestJoinedRef.current) {
              guestJoinedRef.current = true;
              void channel.track({
                name: displayName,
                role: asRole,
                participantId: participantKeyRef.current,
                startedAt: startedAtRef.current,
                guestJoined: true,
                persistent: persistentRef.current,
              });
              persist({ code: nextCode, role: asRole });
            }
            return;
          }

          if (hasHostPresence(channel)) {
            lastHostSeenAtRef.current = Date.now();
          }
        })
        .subscribe(async (state) => {
          if (!isCurrent()) return;
          if (state === "SUBSCRIBED") {
            const trackResult = await channel.track({
              name: displayName,
              role: asRole,
              participantId: participantKeyRef.current,
              startedAt: startedAtRef.current,
              guestJoined: guestJoinedRef.current,
              persistent: persistentRef.current,
            });
            if (!isCurrent()) return;
            if (trackResult !== "ok") {
              resetLocal();
              setStatus("error");
              toast.error("Couldn't connect to the Jam. Try again.");
              return;
            }
            if (asRole === "guest") {
              await channel.send({
                type: "broadcast",
                event: "join-request",
                payload: {
                  requestId: joinRequestId,
                  participantId: participantKeyRef.current,
                  role: "guest",
                  name: displayName,
                },
              });
              if (!(await waitForHost())) {
                if (!isCurrent()) return;
                resetLocal();
                setStatus("error");
                toast.error("This Jam is no longer available.");
                return;
              }
            }
            rememberMember({
              participantId: participantKeyRef.current,
              role: asRole,
              name: displayName,
            });
            setStatus("connected");
            persist({ code: nextCode, role: asRole });
            if (asRole === "host") {
              void sendSnapshot(channel);
            } else {
              void channel.send({
                type: "broadcast",
                event: "sync-request",
                payload: {},
              });
            }
          } else if (
            state === "CHANNEL_ERROR"
            || state === "TIMED_OUT"
            || state === "CLOSED"
          ) {
            setStatus("error");
          }
        });
    },
    [
      applySync,
      authStatus,
      authSession?.user?.id,
      disconnectChannel,
      dispatch,
      displayName,
      endJam,
      persist,
      publishMembers,
      rememberMember,
      resetLocal,
      sendSnapshot,
      publishAux,
    ],
  );

  const host = useCallback(() => {
    guestJoinedRef.current = false;
    startedAtRef.current = Date.now();
    persistentRef.current = false;
    nameRef.current = "";
    return connect(makeJamCode(), "host", { startedAt: startedAtRef.current, guestJoined: false, create: true });
  }, [connect]);

  const hostNamed = useCallback((roomName) => {
    guestJoinedRef.current = false;
    startedAtRef.current = Date.now();
    persistentRef.current = true;
    nameRef.current = roomName;
    return connect(makeJamCode(), "host", {
      startedAt: startedAtRef.current,
      guestJoined: false,
      create: true,
      name: roomName,
    });
  }, [connect]);

  const join = useCallback(
    (value) => connect(normalizeJamCode(value), "guest"),
    [connect],
  );

  const reconnect = useCallback(() => {
    if (!role || !code) return Promise.resolve();
    return connect(code, role, {
      startedAt: startedAtRef.current,
      guestJoined: guestJoinedRef.current,
    });
  }, [code, connect, role]);

  const enqueue = useCallback(
    (track) => {
      if (!channelRef.current || !track?.id) return false;
      const queue = Array.isArray(playerStateRef.current.youtubeQueue)
        ? playerStateRef.current.youtubeQueue
        : [];
      if (queue.some((item) => item?.id === track.id)) return false;
      playerStateRef.current = {
        ...playerStateRef.current,
        youtubeQueue: [...queue, track],
      };
      dispatch(appendToQueue([track]));
      void channelRef.current.send({
        type: "broadcast",
        event: "enqueue",
        payload: { track },
      });
      return true;
    },
    [dispatch],
  );

  const passAux = useCallback((participantId) => {
    if (roleRef.current !== "host") return false;
    const member = membersRef.current.get(participantId);
    const grant = createAuxGrant(member, AUX_SONG_LIMIT);
    if (!grant) return false;
    publishAux(grant);
    toast(`Aux passed to ${grant.holderName} for ${grant.remaining} songs.`);
    return true;
  }, [publishAux]);

  const reclaimAux = useCallback(() => {
    if (roleRef.current !== "host" || !auxRef.current) return false;
    publishAux(null);
    toast("Aux is back with the host.");
    return true;
  }, [publishAux]);

  const requestAuxSkip = useCallback(() => {
    if (!canControlAux(auxRef.current, participantKeyRef.current) || !channelRef.current) {
      return false;
    }
    void channelRef.current.send({
      type: "broadcast",
      event: "aux-control",
      payload: { action: "skip" },
    });
    return true;
  }, []);

  const postScore = useCallback((summary) => {
    if (!channelRef.current || (roleRef.current !== "host" && roleRef.current !== "guest")) return false;
    const score = sanitizeArcadeScore({
      ...summary,
      name: displayName,
    });
    void channelRef.current.send({
      type: "broadcast",
      event: "arcade-score",
      payload: score,
    });
    setScores((current) => [score, ...current].slice(0, 8));
    return true;
  }, [displayName]);

  const loadRooms = useCallback(async () => {
    try {
      const response = await fetch("/api/jam", { headers: { accept: "application/json" } });
      const json = await response.json();
      if (!response.ok || !Array.isArray(json.data?.rooms)) {
        setRooms([]);
        return [];
      }
      setRooms(json.data.rooms);
      return json.data.rooms;
    } catch {
      setRooms([]);
      return [];
    }
  }, []);

  useEffect(() => {
    if (!role || status !== "connected" || !channelRef.current) return undefined;
    const channel = channelRef.current;

    const heartbeat = () => {
      if (channelRef.current !== channel) return;
      const member = {
        participantId: participantKeyRef.current,
        role,
        name: displayName,
        startedAt: startedAtRef.current,
        guestJoined: guestJoinedRef.current,
        persistent: persistentRef.current,
      };
      rememberMember(member);
      void channel.send({ type: "broadcast", event: "heartbeat", payload: member });

      const staleBefore = Date.now() - HOST_RECONNECT_GRACE_MS;
      let changed = false;
      for (const [participantId, known] of membersRef.current) {
        if (
          participantId !== participantKeyRef.current
          && known.seenAt < staleBefore
        ) {
          membersRef.current.delete(participantId);
          changed = true;
        }
      }
      if (changed) publishMembers();

      if (role === "guest") {
        if (hasHostPresence(channel)) lastHostSeenAtRef.current = Date.now();
        if (
          lastHostSeenAtRef.current > 0
          && Date.now() - lastHostSeenAtRef.current >= HOST_RECONNECT_GRACE_MS
          && !hasHostPresence(channel)
        ) {
          resetLocal();
          toast("This Jam has ended.");
        }
      }
    };

    heartbeat();
    const timer = window.setInterval(heartbeat, JAM_HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [
    displayName,
    publishMembers,
    rememberMember,
    resetLocal,
    role,
    status,
  ]);

  useEffect(() => {
    if (role !== "host" || !channelRef.current || applyingRemoteRef.current) return;
    void sendSnapshot();
  }, [isPlaying, role, sendSnapshot, youtubeQueue, youtubeVideo]);

  // Correct clock drift and give late subscribers another snapshot even if a
  // presence event was delayed or dropped.
  useEffect(() => {
    if (role !== "host" || status !== "connected") return undefined;
    const timer = window.setInterval(() => void sendSnapshot(), 4000);
    return () => window.clearInterval(timer);
  }, [role, sendSnapshot, status]);

  useEffect(() => {
    if (authStatus === "loading") return;
    if (authStatus !== "authenticated") {
      restoredRef.current = false;
      if (roleRef.current) {
        void leave();
      } else {
        clearJamSession();
      }
      return;
    }
    if (restoredRef.current) return;
    restoredRef.current = true;
    const saved = readJamSession();
    const linkCode = jamCodeFromPath(window.location.pathname);
    // A /jam/[code] visit owns the connection. Restoring a different saved
    // room here would cancel the link join via connectAttemptRef.
    if (linkCode && saved?.code !== linkCode) {
      return;
    }
    if (!saved) return;
    if (shouldExpireEmptyJam(saved)) {
      clearJamSession();
      return;
    }
    if (saved.participantId) participantKeyRef.current = saved.participantId;
    startedAtRef.current = saved.startedAt;
    guestJoinedRef.current = saved.guestJoined;
    persistentRef.current = Boolean(saved.persistent);
    nameRef.current = saved.name || "";
    void connect(saved.code, saved.role, {
      startedAt: saved.startedAt,
      guestJoined: saved.guestJoined,
    });
  }, [authStatus, connect, leave]);

  useEffect(() => {
    if (role !== "host") return undefined;
    const tick = () => {
      if (shouldExpireEmptyJam({
        role: "host",
        startedAt: startedAtRef.current,
        guestJoined: guestJoinedRef.current,
        persistent: persistentRef.current,
      })) {
        void endJam("Jam ended — nobody joined within 10 minutes.");
      }
    };
    const timer = window.setInterval(tick, 1000);
    tick();
    return () => window.clearInterval(timer);
  }, [endJam, role]);

  // Drop the socket on unmount, but keep the session so a refresh can reconnect.
  useEffect(() => () => disconnectChannel(), [disconnectChannel]);

  return {
    available: isSupabaseConfigured() && authStatus === "authenticated",
    ready: authStatus !== "loading",
    role,
    code,
    name,
    persistent,
    listeners,
    status,
    host,
    hostNamed,
    join,
    reconnect,
    leave,
    endJam,
    enqueue,
    aux,
    people,
    rooms,
    scores,
    loadRooms,
    postScore,
    hasAux: canControlAux(aux, participantKeyRef.current),
    passAux,
    reclaimAux,
    requestAuxSkip,
  };
}
