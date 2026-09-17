"use client";

import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import DiscordBridgeClient from "@/lib/discordBridgeClient";
import {
  buildDiscordActivity,
  presenceTrack,
  shouldPublishDiscordPresence,
} from "@/utils/discordPresence.mjs";
import { setDiscordPresenceStatus } from "@/utils/discordPresenceStatus";
import { SITE_NAME, SITE_URL } from "@/utils/siteConfig";

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
  const publish = shouldPublishDiscordPresence({ enabled: enabled && consent, privateSession, track });

  useEffect(() => {
    if (!enabled || !consent) {
      setDiscordPresenceStatus({ state: "off", detail: "" });
      startedAtRef.current = { id: "", startedAt: 0 };
      failedRequestRef.current = null;
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

    // A failed first connection is terminal for this explicit request. We do not
    // probe localhost again on timers, visibility changes, track changes, or
    // browser online events. Toggling Discord listening activity off/on creates
    // a new connectRequest and allows one new attempt. Once a bridge has
    // connected successfully, normal activity updates may reconnect if that
    // established local bridge later drops.
    if (!hasConnectedRef.current && failedRequestRef.current === connectRequest) {
      return undefined;
    }

    const client = clientRef.current || new DiscordBridgeClient();
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
  ]);

  useEffect(() => () => {
    clientRef.current?.disconnect();
    clientRef.current = null;
  }, []);
}
