"use client";

import { useEffect } from "react";
import { bindAudioController } from "../audio/controller";
import type { AudioAdapter, AudioSessionStore } from "../audio/types";

/** Mount at the persistent app root, never inside a routed page or player drawer. */
export default function useAudioController(port: AudioSessionStore, adapter: AudioAdapter) {
  useEffect(() => bindAudioController(port, adapter), [port, adapter]);
}
