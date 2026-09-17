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

const RETRY_AFTER_ERROR_MS = 10_000;
const REFRESH_WHILE_CONNECTED_MS = 60_000;

function unavailableError(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /bridge|discord desktop|ipc|disconnected|not running|not connected|unavailable/i.test(message);
}

export default function useDiscordPresence() {
  const enabled = useSelector((state) => state.settings.discordPresence !== false);
  const privateSession = useSelector((state) => state.settings.privateSession);
  const youtubeVideo = useSelector((state) => state.player.youtubeVideo);
  const activeSong = useSelector((state) => state.player.activeSong);
  const isPlaying = useSelector((state) => state.player.isPlaying);
  const position = useSelector((state) => state.player.position);
  const clientRef = useRef(null);
  const startedAtRef = useRef({ id: "", startedAt: 0 });
  const positionRef = useRef(position);
  positionRef.current = position;

  const track = presenceTrack({ youtubeVideo, activeSong });
  const trackId = track?.id || "";
  const trackTitle = track?.title || "";
  const trackArtist = track?.artist || "";
  const trackArtwork = track?.artwork || "";
  const trackDuration = track?.duration || 0;
  const publish = shouldPublishDiscordPresence({ enabled, privateSession, track });

  useEffect(() => {
    if (enabled === false) {
      setDiscordPresenceStatus({ state: "off", detail: "" });
    } else if (privateSession) {
      setDiscordPresenceStatus({ state: "private", detail: "" });
    } else if (!trackId) {
      setDiscordPresenceStatus({ state: "idle", detail: "" });
    }

    if (!publish) {
      startedAtRef.current = trackId ? startedAtRef.current : { id: "", startedAt: 0 };
      if (clientRef.current?.connected) {
        clientRef.current.setActivity(null).catch(() => {});
      }
      return undefined;
    }

    const client = clientRef.current || new DiscordBridgeClient();
    clientRef.current = client;
    let cancelled = false;
    let retryTimer = null;

    if (startedAtRef.current.id !== trackId || !isPlaying) {
      startedAtRef.current = {
        id: trackId,
        startedAt: Date.now() - Math.max(0, Number(positionRef.current) || 0) * 1000,
      };
    }

    const schedule = (delay, callback) => {
      if (cancelled) return;
      retryTimer = window.setTimeout(callback, delay);
    };

    const publishPresence = async () => {
      if (cancelled) return;

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

      setDiscordPresenceStatus({ state: "connecting", detail: "" });
      try {
        await client.setActivity(activity);
        if (cancelled) return;
        setDiscordPresenceStatus({ state: "connected", detail: trackTitle });
        schedule(REFRESH_WHILE_CONNECTED_MS, publishPresence);
      } catch (error) {
        if (cancelled) return;
        const detail = error instanceof Error ? error.message : "Discord Rich Presence failed.";
        setDiscordPresenceStatus({
          state: unavailableError(error) ? "unavailable" : "error",
          detail,
        });
        schedule(RETRY_AFTER_ERROR_MS, publishPresence);
      }
    };

    publishPresence();

    const retryNow = () => {
      if (cancelled) return;
      if (retryTimer) window.clearTimeout(retryTimer);
      retryTimer = null;
      publishPresence();
    };
    window.addEventListener("online", retryNow);
    document.addEventListener("visibilitychange", retryNow);

    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      window.removeEventListener("online", retryNow);
      document.removeEventListener("visibilitychange", retryNow);
    };
  }, [
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
