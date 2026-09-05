"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useSession } from "next-auth/react";
import {
  setYoutubeVideo,
  setYoutubeQueue,
  playPause,
  appendToQueue,
} from "@/redux/features/playerSlice";
import { getSupabase, isSupabaseConfigured } from "@/utils/supabaseClient";

// Ambiguous characters (0/O, 1/I/L) removed so codes are easy to read aloud.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function makeCode() {
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export default function useJamSession() {
  const dispatch = useDispatch();
  const { data: authSession } = useSession();
  const { youtubeVideo, youtubeQueue, isPlaying } = useSelector((state) => state.player);

  const [role, setRole] = useState(null); // "host" | "guest" | null
  const [code, setCode] = useState("");
  const [listeners, setListeners] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | connecting | connected | error

  const channelRef = useRef(null);
  const supabaseRef = useRef(null);
  const applyingRemoteRef = useRef(false);
  const playerStateRef = useRef({ youtubeVideo, youtubeQueue, isPlaying });

  useEffect(() => {
    playerStateRef.current = { youtubeVideo, youtubeQueue, isPlaying };
  }, [youtubeVideo, youtubeQueue, isPlaying]);

  const displayName =
    authSession?.user?.name || authSession?.user?.email?.split("@")[0] || "Listener";

  // Guests mirror the host's playback. Guard against re-broadcasting our own applied state.
  const applySync = useCallback(
    (payload) => {
      if (!payload) return;
      applyingRemoteRef.current = true;
      const current = playerStateRef.current;
      if (payload.track?.id && payload.track.id !== current.youtubeVideo?.id) {
        dispatch(setYoutubeQueue(Array.isArray(payload.queue) ? payload.queue : []));
        dispatch(setYoutubeVideo(payload.track));
      } else {
        if (Array.isArray(payload.queue)) dispatch(setYoutubeQueue(payload.queue));
        if (typeof payload.isPlaying === "boolean" && payload.isPlaying !== current.isPlaying) {
          dispatch(playPause(payload.isPlaying));
        }
      }
      window.setTimeout(() => {
        applyingRemoteRef.current = false;
      }, 0);
    },
    [dispatch],
  );

  const connect = useCallback(
    async (roomCode, asRole) => {
      if (!roomCode) {
        setStatus("error");
        return;
      }
      setStatus("connecting");
      const supabase = await getSupabase();
      if (!supabase) {
        setStatus("error");
        return;
      }
      supabaseRef.current = supabase;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      const channel = supabase.channel(`jam:${roomCode}`, {
        config: { broadcast: { self: false }, presence: { key: displayName } },
      });

      channel
        .on("broadcast", { event: "sync" }, ({ payload }) => {
          if (asRole === "guest") applySync(payload);
        })
        .on("broadcast", { event: "enqueue" }, ({ payload }) => {
          if (payload?.track?.id) dispatch(appendToQueue([payload.track]));
        })
        .on("presence", { event: "sync" }, () => {
          const people = Object.values(channel.presenceState())
            .flat()
            .map((entry) => entry.name || "Listener");
          setListeners(people);
        })
        .subscribe(async (state) => {
          if (state === "SUBSCRIBED") {
            setStatus("connected");
            await channel.track({ name: displayName, role: asRole });
            if (asRole === "host") {
              const snapshot = playerStateRef.current;
              channel.send({
                type: "broadcast",
                event: "sync",
                payload: {
                  track: snapshot.youtubeVideo,
                  queue: snapshot.youtubeQueue,
                  isPlaying: snapshot.isPlaying,
                  at: Date.now(),
                },
              });
            }
          } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") {
            setStatus("error");
          }
        });

      channelRef.current = channel;
      setRole(asRole);
      setCode(roomCode);
    },
    [applySync, dispatch, displayName],
  );

  const host = useCallback(() => connect(makeCode(), "host"), [connect]);
  const join = useCallback(
    (value) => connect(String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6), "guest"),
    [connect],
  );

  const leave = useCallback(() => {
    const supabase = supabaseRef.current;
    if (channelRef.current && supabase) supabase.removeChannel(channelRef.current);
    channelRef.current = null;
    setRole(null);
    setCode("");
    setListeners([]);
    setStatus("idle");
  }, []);

  const enqueue = useCallback(
    (track) => {
      if (!channelRef.current || !track?.id) return;
      dispatch(appendToQueue([track]));
      channelRef.current.send({ type: "broadcast", event: "enqueue", payload: { track } });
    },
    [dispatch],
  );

  // Host broadcasts playback state whenever it changes.
  useEffect(() => {
    if (role !== "host" || !channelRef.current || applyingRemoteRef.current) return;
    channelRef.current.send({
      type: "broadcast",
      event: "sync",
      payload: { track: youtubeVideo, queue: youtubeQueue, isPlaying, at: Date.now() },
    });
  }, [role, youtubeVideo, youtubeQueue, isPlaying]);

  useEffect(() => () => leave(), [leave]);

  return {
    available: isSupabaseConfigured(),
    role,
    code,
    listeners,
    status,
    host,
    join,
    leave,
    enqueue,
  };
}
