"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import EmptyState from "@/components/EmptyState";
import UserMessage from "@/components/UserMessage";
import { requestJson } from "@/services/http";
import { toUserError } from "@/utils/userError";
import { cleanTitle } from "@/utils/text";
import { preferredArtistChannel, artistPageHref } from "@/utils/artistNavigation.mjs";
import { buildYoutubeSearchUrl } from "@/utils/youtubeSearchUrl.mjs";

function ArtistLookup() {
  const router = useRouter();
  const params = useSearchParams();
  const name = cleanTitle(params.get("name")).slice(0, 120);
  const [found, setFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setFound(false);
    setError(null);
    setLoading(Boolean(name));
    if (!name) return () => controller.abort();
    requestJson(buildYoutubeSearchUrl({ q: name, type: "channel" }), {
      signal: controller.signal,
      fallbackTitle: "Artist lookup unavailable",
      fallbackMessage: "We couldn’t find this artist right now. Please try again.",
    }).then(data => {
      if (controller.signal.aborted) return;
      if (!Array.isArray(data?.results)) throw new Error("Invalid artist search response");
      const artist = preferredArtistChannel(data.results, name);
      if (artist) { setFound(true); router.replace(artistPageHref(artist.id, artist.title)); }
    }).catch(failure => {
      if (!controller.signal.aborted) setError(toUserError(failure));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [name, retryKey, router]);

  return <main className="page">
    <p className="eyebrow">Artist</p>
    <h1 className="mt-2 text-3xl font-bold">{name || "Find an artist"}</h1>
    {(loading || found) && <p className="mt-6 text-[var(--muted)]" role="status">Finding this artist…</p>}
    {!loading && error && <div className="mt-6"><UserMessage title={error.title} message={error.message} onRetry={() => setRetryKey(value => value + 1)} /></div>}
    {!loading && !found && !error && <div className="mt-6"><EmptyState title="No matching artist found" message="Try searching for the artist by name." href={`/search/${encodeURIComponent(name)}`} actionLabel="Search music" /></div>}

  </main>;
}

export default function ArtistLookupPage() {
  return <Suspense fallback={<p className="page" role="status">Finding this artist…</p>}><ArtistLookup /></Suspense>;
}
