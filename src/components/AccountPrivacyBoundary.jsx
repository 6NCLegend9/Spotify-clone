"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { accountOwner } from "@/utils/accountCache.mjs";
import { ACCOUNT_LOGOUT_KEY, clearLocalAccountCaches, setActiveAccountOwner } from "@/utils/accountStorage.mjs";

export default function AccountPrivacyBoundary() {
  const { data: session, status } = useSession();
  const owner = accountOwner(session, status);
  const previousOwner = useRef(null);
  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated" || (previousOwner.current && previousOwner.current !== owner)) {
      clearLocalAccountCaches({ notify: Boolean(previousOwner.current) });
    }
    setActiveAccountOwner(status === "authenticated" ? owner : null);
    previousOwner.current = status === "authenticated" ? owner : null;
  }, [owner, status]);
  useEffect(() => {
    const onLogout = (event) => {
      if (event.key === ACCOUNT_LOGOUT_KEY) clearLocalAccountCaches({ notify: status === "authenticated" });
    };
    window.addEventListener("storage", onLogout);
    return () => window.removeEventListener("storage", onLogout);
  }, [status]);
  return null;
}
