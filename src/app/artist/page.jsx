"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import EmptyState from "@/components/EmptyState";
import UserMessage from "@/components/UserMessage";
import { requestJson } from "@/services/http";
import { toUserError } from "@/utils/userError";
import { cleanTitle } from "@/utils/text";
import { normalizeRadioArtist } from "@/utils/radioSeed.mjs";
import { artistChannelChoices, artistPageHref } from "@/utils/artistNavigation.mjs";
import { buildYoutubeSearchUrl } from "@/utils/youtubeSearchUrl.mjs";

function ArtistLookup() {
  const router = useRouter();
  const params = useSearchParams();
  const name = cleanTitle(params.get("name")).slice(0, 120);
  const [choices, setChoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setChoices([]);
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
      const matches = artistChannelChoices(data.results, name);
      if (matches.length === 1 && normalizeRadioArtist(matches[0].title) === normalizeRadioArtist(name)) {
        router.replace(artistPageHref(matches[0].id, name));
      } else setChoices(matches);
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
    {loading && <p className="mt-6 text-[var(--muted)]" role="status">Finding this artist…</p>}
    {!loading && error && <div className="mt-6"><UserMessage title={error.title} message={error.message} onRetry={() => setRetryKey(value => value + 1)} /></div>}
    {!loading && !error && !choices.length && <div className="mt-6"><EmptyState title="No matching artist found" message="Try searching for the artist by name." href={`/search/${encodeURIComponent(name)}`} actionLabel="Search music" /></div>}
    {choices.length > 0 && <section className="mt-6" aria-label="Artist matches">
      <p className="mb-3 text-sm text-[var(--muted)]">Choose the artist’s channel.</p>
      <ul className="space-y-2">{choices.map(artist => <li key={artist.id}>
        <Link href={artistPageHref(artist.id, artist.title)} prefetch={false} className="flex min-h-11 items-center rounded-lg border border-[var(--hairline-cyan)] px-4 py-3 hover:bg-[var(--navy-panel)]">{artist.title}</Link>
      </li>)}</ul>
    </section>}
  </main>;
}

export default function ArtistLookupPage() {
  return <Suspense fallback={<p className="page" role="status">Finding this artist…</p>}><ArtistLookup /></Suspense>;
}
