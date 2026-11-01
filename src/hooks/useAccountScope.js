"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useSession } from "next-auth/react";
import { accountOwner } from "@/utils/accountCache.mjs";
import { ACCOUNT_DATA_CLEARED, accountStorageGeneration, canWriteAccountCache } from "@/utils/accountStorage.mjs";

function subscribe(listener) {
  window.addEventListener(ACCOUNT_DATA_CLEARED, listener);
  return () => window.removeEventListener(ACCOUNT_DATA_CLEARED, listener);
}

// The privacy boundary remains the authority; this only scopes mounted UI and async work to it.
export default function useAccountScope() {
  const { data: session, status } = useSession();
  const owner = accountOwner(session, status);
  const generation = useSyncExternalStore(subscribe, accountStorageGeneration, () => 0);
  const key = `${status}:${owner || ""}:${generation}`;
  const latest = useRef(key);
  const live = useRef(true);
  latest.current = key;
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);
  const isCurrent = () => live.current && latest.current === key
    && status === "authenticated" && Boolean(owner)
    && generation === accountStorageGeneration() && canWriteAccountCache(owner);
  return { owner, status, key, isCurrent };
}
