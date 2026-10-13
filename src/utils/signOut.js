import { signOut } from "next-auth/react";
import { clearLocalAccountCaches, getActiveAccountOwner, setActiveAccountOwner } from "./accountStorage.mjs";
import { invalidateClientCache } from "@/services/http";

export async function signOutWithPrivacy(options) {
  const owner = getActiveAccountOwner();
  clearLocalAccountCaches({ broadcast: true });
  invalidateClientCache();
  try {
    return await signOut(options);
  } catch (error) {
    setActiveAccountOwner(owner);
    throw error;
  }
}
