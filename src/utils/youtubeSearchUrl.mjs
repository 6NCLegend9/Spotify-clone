import { normalizeYoutubeSearchPurpose } from "./youtubeSearchPurpose.mjs";

export function buildYoutubeSearchUrl(input = {}, purpose = "interactive") {
  const params = input instanceof URLSearchParams
    ? new URLSearchParams(input)
    : new URLSearchParams();

  if (!(input instanceof URLSearchParams)) {
    for (const [key, value] of Object.entries(input || {})) {
      if (value === null || value === undefined) continue;
      params.set(key, String(value));
    }
  }

  params.set("purpose", normalizeYoutubeSearchPurpose(purpose));
  return `/api/youtube-search?${params.toString()}`;
}
