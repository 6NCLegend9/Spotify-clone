# Provider reliability and shared metadata caching

This change strengthens the existing Next.js 15 backend without adding another database or paid service. It applies to public YouTube search/video metadata, not audio streaming or user library storage.

## Runtime behavior

- Public search and video reads use Next.js Data Cache, including channel searches. Keys hash the endpoint, sorted parameters, official-only requirement, and whether an API key is configured.
- Search entries revalidate after 15 minutes; video metadata after one hour. Next.js may serve stale metadata during revalidation. Playback availability is still determined by the player; metadata does not prove that embedding is allowed.
- Errors, empty results and placeholder titles are not persisted. Explicit no-store, caller signals, custom headers/body/method, and sensitive parameters bypass sharing. Private account/history/playlist responses are excluded.
- Matching requests in one instance share an in-flight promise. Reuse across instances depends on the deployment's Data Cache backend. There is no distributed lock; separate instances can still fetch a simultaneous cold miss.
- GET/HEAD calls retry at most once for network failures, 429, or 500/502/503/504. Delays include jitter and honor Retry-After when it fits within the existing six-second transport deadline. POST calls are not retried. Body consumption occurs after fetch returns, as before; this is not a whole-route deadline.
- Four failed logical requests open an endpoint circuit for 30 seconds per instance. One recovery probe is admitted after cooldown. Caller cancellation does not count as provider failure. The existing official API quota cooldown is retained.
- Empty oEmbed placeholders no longer occupy the local video cache for an hour.

## Operations

Shared caching is enabled by default. Set `YOUTUBE_SHARED_CACHE=0` to bypass the new cache layer during an incident; existing provider/HTTP caches are unchanged.

Set `SERVER_DIAGNOSTICS=1` to enable the existing structured logger. Search responses carry `X-Request-Id`, and origin request/provider records share that identifier. CDN hits can reuse a cached origin header without executing backend code. Logs include bounded status, attempts, elapsed time, cache outcome and error code. They exclude query text, titles, credentials, complete URLs and account data.

Compare cache hits/misses, provider failures, retries and search latency before and after deployment. No production credentials, infrastructure settings or deployment configuration are changed.

## Validation

Run `node --test test/providerBackend.test.mjs test/diagnostics.test.mjs`.

Tests cover retry classification, Retry-After, cancellation, deadline expiry, circuit recovery, key isolation, concurrent request coalescing, success reuse across cache clients, failed/placeholder responses, cache outages and diagnostic redaction. Cache tests use an injected store; deployment validation is required for Vercel persistence and real upstream behavior.

## Separate follow-ups

Durable jobs for playlist imports/recommendations and real-time Jam transport changes require separate integration and deployment validation. No async playlist writes, sharding, replicas or separate CQRS databases are introduced. User mutations retain their existing save-before-success behavior, and this transport does not enable retries on them. These changes do not bypass YouTube restrictions or guarantee mobile background playback.
