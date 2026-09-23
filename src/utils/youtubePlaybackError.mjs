export const MAX_SAME_ID_RETRIES = 2;
export const MAX_ALTERNATE_ATTEMPTS = 3;

/**
 * @typedef {"retrySame" | "tryAlternate" | "skipQueue" | "fatalUI"} PlaybackFailureAction
 */

/**
 * Map a YouTube IFrame error code (or synthetic stall token) to user copy and
 * whether a same-id manual retry is useful.
 */
export function youtubePlaybackError(value) {
  const code = Number(value);
  if (code === 101 || code === 150) {
    return {
      code,
      canRetry: false,
      message: "YouTube does not allow this video to play here.",
      detail: "Choose another upload or open it on YouTube. HayKasa guest mode cannot remove this restriction.",
    };
  }
  if (code === 100) {
    return { code, canRetry: false, message: "This video is unavailable or private.", detail: "Search for another upload of this song." };
  }
  if (code === 153) {
    return { code, canRetry: true, message: "YouTube could not verify this player.", detail: "Try opening HayKasa in your browser, or open the video on YouTube." };
  }
  return {
    code,
    canRetry: true,
    message: code === 2 ? "YouTube could not load this video."
      : code === 5 ? "This video could not play in your browser." : "YouTube playback failed.",
    detail: "If YouTube asks you to sign in or confirm you are not a bot, open the video on YouTube. Signing in to HayKasa does not sign you in to YouTube.",
  };
}

/**
 * Decide the next automatic recovery step for a playback failure.
 * Caps same-id retries and alternate uploads so we never loop forever.
 *
 * @param {{
 *   code?: number | string | null,
 *   kind?: string | null,
 *   sameIdAttempts?: number,
 *   alternateAttempts?: number,
 * }} input
 */
export function youtubePlaybackFailurePolicy(input = {}) {
  const kind = input.kind || "playback";
  if (kind === "autoplay") {
    return {
      action: /** @type {PlaybackFailureAction} */ ("fatalUI"),
      error: {
        kind: "autoplay",
        canRetry: true,
        message: "Your browser blocked autoplay. Select Retry to start playback.",
        detail: "",
      },
    };
  }

  const sameIdAttempts = Math.max(0, Number(input.sameIdAttempts) || 0);
  const alternateAttempts = Math.max(0, Number(input.alternateAttempts) || 0);
  const raw = input.code;
  const isStall = raw === "stall";
  const base = isStall
    ? {
        code: raw,
        canRetry: true,
        message: "This video stopped buffering.",
        detail: "Retry playback, or search for another version of this song.",
      }
    : youtubePlaybackError(raw);
  const error = { kind: "playback", ...base };

  // Embed blocks never recover on the same id, and stalls were already
  // reloaded twice by buffer recovery before reaching this policy.
  const retryable = !isStall && base.canRetry !== false;
  if (retryable && sameIdAttempts < MAX_SAME_ID_RETRIES) {
    return { action: /** @type {PlaybackFailureAction} */ ("retrySame"), error };
  }
  if (alternateAttempts < MAX_ALTERNATE_ATTEMPTS) {
    return { action: /** @type {PlaybackFailureAction} */ ("tryAlternate"), error };
  }
  return { action: /** @type {PlaybackFailureAction} */ ("skipQueue"), error };
}

export function alternateSearchQuery(track) {
  const title = String(track?.title || "").trim();
  const channel = String(track?.channel || track?.author || "").trim();
  return [title, channel].filter(Boolean).join(" ").slice(0, 100) || "music";
}
