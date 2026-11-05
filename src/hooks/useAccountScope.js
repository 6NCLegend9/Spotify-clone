"use client";

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useSession } from "next-auth/react";
import { accountOwner } from "@/utils/accountCache.mjs";
import { accountStorageGeneration, canWriteAccountCache, subscribeAccountStorageGeneration } from "@/utils/accountStorage.mjs";

// The privacy boundary remains the authority; this only scopes mounted UI and async work to it.
export default function useAccountScope() {
  const { data: session, status } = useSession();
  const owner = accountOwner(session, status);
  const generation = useSyncExternalStore(subscribeAccountStorageGeneration, accountStorageGeneration, () => 0);
  const key = `${status}:${owner || ""}:${generation}`;
  const latest = useRef(key);
  const live = useRef(true);
  latest.current = key;
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);
  const isCurrentView = useCallback(() => live.current && latest.current === key
    && generation === accountStorageGeneration(), [generation, key]);
  const isCurrent = useCallback(() => isCurrentView() && status === "authenticated"
    && Boolean(owner) && canWriteAccountCache(owner), [isCurrentView, owner, status]);
  return useMemo(() => ({ owner, status, key, isCurrent, isCurrentView }),
    [isCurrent, isCurrentView, key, owner, status]);
}
