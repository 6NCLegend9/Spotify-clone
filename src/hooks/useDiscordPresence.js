"use client";

import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import DiscordRpcClient from "@/lib/discordRpcClient";
import { readDiscordClientId } from "@/utils/discordOAuth.mjs";
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
  const clientId = readDiscordClientId({
    NEXT_PUBLIC_DISCORD_CLIENT_ID: process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID,
  });
  const track = presenceTrack({ youtubeVideo, activeSong });
  const trackId = track?.id || "";
  const trackTitle = track?.title || "";
  const trackArtist = track?.artist || "";
  const trackArtwork = track?.artwork || "";
  const trackDuration = track?.duration || 0;
  const publish = shouldPublishDiscordPresence({ enabled, privateSession, track });

  useEffect(() => {
    if (!clientId) {
      setDiscordPresenceStatus({ state: "unconfigured", detail: "" });
      return undefined;
    }
    if (enabled === false) {
      setDiscordPresenceStatus({ state: "off", detail: "" });
    } else if (privateSession) {
      setDiscordPresenceStatus({ state: "private", detail: "" });
    }

    const client = clientRef.current?.clientId === clientId
      ? clientRef.current
      : new DiscordRpcClient(clientId);
    clientRef.current = client;

    let cancelled = false;
    if (!trackId) {
      startedAtRef.current = { id: "", startedAt: 0 };
    } else if (startedAtRef.current.id !== trackId) {
      startedAtRef.current = {
        id: trackId,
        startedAt: Date.now() - Math.max(0, Number(positionRef.current) || 0) * 1000,
      };
    }

    const activity = publish
      ? buildDiscordActivity({
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
      })
      : null;

    (async () => {
      try {
        if (!publish && !client.authenticated) return;
        await client.setActivity(activity);
        if (cancelled) return;
        if (publish) setDiscordPresenceStatus({ state: "connected", detail: trackTitle });
        else if (enabled === false) setDiscordPresenceStatus({ state: "off", detail: "" });
        else if (privateSession) setDiscordPresenceStatus({ state: "private", detail: "" });
        else setDiscordPresenceStatus({ state: "idle", detail: "" });
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Discord presence failed.";
        setDiscordPresenceStatus({
          state: /not available|socket|timeout|closed/i.test(message) ? "unavailable" : "error",
          detail: message,
        });
      }
    })();

    const onPageHide = () => {
      if (client.authenticated) client.setActivity(null).catch(() => {});
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [
    clientId,
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
    const client = clientRef.current;
    if (!client) return;
    client.setActivity(null).catch(() => {});
    client.disconnect();
    clientRef.current = null;
  }, []);
}
