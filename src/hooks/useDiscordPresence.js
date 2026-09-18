"use client";

import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { createDiscordPresenceClient } from "@/lib/discordPresenceClient";
import {
  buildDiscordActivity,
  presenceTrack,
  shouldPublishDiscordPresence,
} from "@/utils/discordPresence.mjs";
import { setDiscordPresenceStatus } from "@/utils/discordPresenceStatus";
import { SITE_NAME, SITE_URL } from "@/utils/siteConfig";
import { useJam } from "@/components/Jam/JamProvider";
import { isJamCode, normalizeJamCode, requestJamOpen } from "@/utils/jam.mjs";

function unavailableError(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /bridge|discord desktop|ipc|disconnected|not running|not connected|unavailable/i.test(message);
}

export default function useDiscordPresence() {
  const enabled = useSelector((state) => state.settings.discordPresence === true);
  const consent = useSelector((state) => state.settings.discordPresenceConsent === true);
  const connectRequest = useSelector((state) => state.settings.discordPresenceConnectRequest || 0);
  const privateSession = useSelector((state) => state.settings.privateSession);
  const youtubeVideo = useSelector((state) => state.player.youtubeVideo);
  const activeSong = useSelector((state) => state.player.activeSong);
  const isPlaying = useSelector((state) => state.player.isPlaying);
  const position = useSelector((state) => state.player.position);
  const jam = useJam();
  const clientRef = useRef(null);
  const startedAtRef = useRef({ id: "", startedAt: 0 });
  const positionRef = useRef(position);
  const failedRequestRef = useRef(null);
  const hasConnectedRef = useRef(false);
  positionRef.current = position;

  const track = presenceTrack({ youtubeVideo, activeSong });
  const trackId = track?.id || "";
  const trackTitle = track?.title || "";
  const trackArtist = track?.artist || "";
  const trackArtwork = track?.artwork || "";
  const trackDuration = track?.duration || 0;
  const jamCode = jam?.status === "connected" && isJamCode(jam.code) ? jam.code : "";
  const partySize = Math.max(1, jam?.listeners?.length || 1);
  const publish = shouldPublishDiscordPresence({ enabled: enabled && consent, privateSession, track });

  useEffect(() => {
    if (!enabled || !consent) {
      setDiscordPresenceStatus({ state: "off", detail: "" });
      startedAtRef.current = { id: "", startedAt: 0 };
      failedRequestRef.current = null;
      hasConnectedRef.current = false;
      if (clientRef.current?.connected) {
        clientRef.current.setActivity(null).catch(() => {});
      }
      clientRef.current?.disconnect();
      clientRef.current = null;
      return undefined;
    }

    if (privateSession) {
      setDiscordPresenceStatus({ state: "private", detail: "" });
      if (clientRef.current?.connected) {
        clientRef.current.setActivity(null).catch(() => {});
      }
      return undefined;
    }

    if (!trackId) {
      setDiscordPresenceStatus({ state: "idle", detail: "" });
      startedAtRef.current = { id: "", startedAt: 0 };
      if (clientRef.current?.connected) {
        clientRef.current.setActivity(null).catch(() => {});
      }
      return undefined;
    }

    if (!publish) return undefined;

    // A failed first connection is terminal for this explicit request. Browser
    // mode therefore does not keep probing localhost; desktop mode likewise does
    // not keep reopening Discord IPC after a failed opt-in. Toggling the setting
    // off/on creates one fresh request. Once a transport has connected, ordinary
    // activity updates may reconnect if that established connection later drops.
    if (!hasConnectedRef.current && failedRequestRef.current === connectRequest) {
      return undefined;
    }

    const client = clientRef.current || createDiscordPresenceClient();
    clientRef.current = client;
    let cancelled = false;

    if (startedAtRef.current.id !== trackId || !isPlaying) {
      startedAtRef.current = {
        id: trackId,
        startedAt: Date.now() - Math.max(0, Number(positionRef.current) || 0) * 1000,
      };
    }

    const activity = buildDiscordActivity({
      track: {
        id: trackId,
        title: trackTitle,
        artist: trackArtist,
        artwork: trackArtwork,
        duration: trackDuration,
      },
      playing: isPlaying,
      startedAt: startedAtRef.current.startedAt,
      siteName: SITE_NAME,
      siteUrl: SITE_URL,
      jamCode,
      partySize,
    });

    const publishPresence = async () => {
      setDiscordPresenceStatus({ state: "connecting", detail: "" });
      try {
        await client.setActivity(activity);
        if (cancelled) return;
        hasConnectedRef.current = true;
        failedRequestRef.current = null;
        setDiscordPresenceStatus({ state: "connected", detail: trackTitle });
      } catch (error) {
        if (cancelled) return;
        const detail = error instanceof Error ? error.message : "Discord Rich Presence failed.";
        if (!hasConnectedRef.current) failedRequestRef.current = connectRequest;
        setDiscordPresenceStatus({
          state: unavailableError(error) ? "unavailable" : "error",
          detail,
        });
      }
    };

    void publishPresence();

    return () => {
      cancelled = true;
    };
  }, [
    connectRequest,
    consent,
    enabled,
    isPlaying,
    privateSession,
    publish,
    trackArtist,
    trackArtwork,
    trackDuration,
    trackId,
    trackTitle,
    jamCode,
    partySize,
  ]);

  useEffect(() => {
    const onJoin = typeof window !== "undefined" ? window.heykasaDesktop?.discord?.onJoin : null;
    if (typeof onJoin !== "function") return undefined;
    return onJoin((secret) => {
      const code = normalizeJamCode(secret);
      if (!isJamCode(code) || jam?.status === "connecting") return;
      requestJamOpen();
      if (jam?.code === code && (jam.status === "connected" || jam.status === "connecting")) return;
      jam?.join?.(code);
    });
  }, [jam]);

  useEffect(() => () => {
    clientRef.current?.disconnect();
    clientRef.current = null;
  }, []);
}
