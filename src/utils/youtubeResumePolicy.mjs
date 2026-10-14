// Embed recovery remains foreground-only; authenticated native audio can resume
// while hidden without a browser-specific allowlist. Explicit media-key actions
// are user intent in either provider.
export function shouldDeferYoutubeResume({ hidden = false, explicitUserAction = false, provider = "youtube", authenticated = false } = {}) {
  return Boolean(hidden) && !explicitUserAction && !(provider === "native" && authenticated === true);
}

export function authenticatedPlaybackOwner(session, status, owner) {
  const id = session?.user?.id;
  return status === "authenticated" && typeof id === "string" && Boolean(id.trim()) && owner === `account:${id}`;
}
