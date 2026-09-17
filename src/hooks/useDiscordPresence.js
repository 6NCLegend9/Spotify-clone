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

    if (startedAtRef.current.id !== trackId) {
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

    setDiscordPresenceStatus({ state: "connecting", detail: "" });
    client.setActivity(activity)
      .then(() => {
        if (!cancelled) {
          setDiscordPresenceStatus({ state: "connected", detail: trackTitle });
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setDiscordPresenceStatus({
          state: "error",
          detail: error instanceof Error ? error.message : "Discord Rich Presence failed.",
        });
      });

    return () => {
      cancelled = true;
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
