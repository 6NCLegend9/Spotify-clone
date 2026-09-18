"use client";

import DesktopCompatibilityGate from "@/components/DesktopCompatibilityGate";
import DesktopUpdateNotifier from "@/components/DesktopUpdateNotifier";
import WebUpdateNotifier from "@/components/WebUpdateNotifier";
import useDiscordPresence from "@/hooks/useDiscordPresence";
import useDesktopPlaybackBridge from "@/hooks/useDesktopPlaybackBridge";

export default function DiscordPresenceSync() {
  useDiscordPresence();
  useDesktopPlaybackBridge();
  return <>
    <DesktopCompatibilityGate />
    <DesktopUpdateNotifier />
    <WebUpdateNotifier />
  </>;
}
