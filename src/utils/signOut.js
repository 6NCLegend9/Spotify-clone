import { signOut } from "next-auth/react";
import { clearLocalAccountCaches, getActiveAccountOwner, setActiveAccountOwner } from "./accountStorage.mjs";
import { invalidateClientCache } from "@/services/http";
import { revokeDeviceNativePlaybackGrants } from "./nativePlaybackAuthorization.mjs";

export async function signOutWithPrivacy(options) {
  const owner = getActiveAccountOwner();
  clearLocalAccountCaches({ broadcast: true });
  invalidateClientCache();
  try {
    // Revoke only this server-marked installation while its browser session
    // still authenticates the request; local native ownership is already clear.
    await revokeDeviceNativePlaybackGrants();
    return await signOut(options);
  } catch (error) {
    setActiveAccountOwner(owner);
    throw error;
  }
}
