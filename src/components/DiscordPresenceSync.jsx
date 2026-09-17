"use client";

import DesktopCompatibilityGate from "@/components/DesktopCompatibilityGate";
import DesktopUpdateNotifier from "@/components/DesktopUpdateNotifier";
import WebUpdateNotifier from "@/components/WebUpdateNotifier";
import useDiscordPresence from "@/hooks/useDiscordPresence";

export default function DiscordPresenceSync() {
  useDiscordPresence();
  return <>
    <DesktopCompatibilityGate />
    <DesktopUpdateNotifier />
    <WebUpdateNotifier />
  </>;
}
