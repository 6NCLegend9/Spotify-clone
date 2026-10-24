# Android ordered transport: D06 draft 2

Status: **proposal for targeted joint re-review; no runtime implementation or qualification**. Draft 1 at `b0687e5` received core-design acceptance in [C006](https://github.com/6NCLegend9/Spotify-clone/pull/42#issuecomment-6389302279). This revision, based on PR42 `9bab9d254e95046ed4a26f7f7693e46b299160b8`, addresses its two lifecycle/error and create/recover clarifications. Runtime implementation remains pending confirmation of these changes.

This is capability `ordered-transport-v1`, not the complete catalog/queue/auth/streaming v2 contract. It corrects command/observation ambiguity without changing source delivery, granting guest access or promising background queue ownership. Existing `id`, `action`, `event`, `url`, `title`, `value`, position/duration fields and origin/frame/URL checks remain.

## Approach and ordering point

Use native command ordering plus a session-facing `ForwardingSimpleBasePlayer`. A renderer-only Pause guard cannot distinguish old feedback from notification Play; a callback-only barrier has no guaranteed no-op Pause callback. A raw `ForwardingPlayer` could work but requires three coordinated method overrides and more listener care. The proposed wrapper uses one Play/Pause hook and the existing Media3 1.8.0 dependency.

One native application looper owns validation, transport decisions, player mutation, acknowledgements and snapshot capture. Record the decision before calling the underlying player: listeners can run synchronously. Never stamp an old callback's argument as current state; read the current player and transport record when building the response.

## Types, scope and limits

```ts
type Safe = number; // JSON number, integer, 0..9007199254740991; no coercion
type Positive = number; // Safe, >= 1
type UUID = string; // canonical lowercase UUID; exactly 36 characters
type Scope = { engineId: UUID; bindingId: UUID }; // plus outer envelope id
type Origin = "baseline" | "web" | "system" | "policy";

interface Snapshot {
  processedWebRevision: Safe; // highest well-formed transport revision decided
  appliedWebRevision: Safe;   // highest accepted/applied web transport revision
  intent: {
    revision: Safe;
    playWhenReady: boolean;
    origin: Origin;
    webRevision: Positive | null; // non-null exactly when origin == web
  };
  observed: {
    isPlaying: boolean;
    playWhenReady: boolean;
    state: "idle" | "buffering" | "ready" | "ended";
    suppressionReason: Safe; // pinned Media3 value, not a user command
    policyReason: "none" | "focus" | "noisy" | "switch" | "timeout" | "other";
  };
}

interface TransportCommand {
  id: string; // existing audio_<UUID>; identifies one load, never a song ID
  action: "play" | "pause";
  transport: Scope & { version: 1; webRevision: Positive };
}

interface TransportResult {
  webRevision: Positive;
  action: "play" | "pause";
  phase: "accepted" | "completed" | "rejected";
  decisionIntentRevision: Safe | null; // historical decision, not current state
  reason?: "SUPERSEDED" | "UNAVAILABLE" | "PLAYER_ERROR" | "TIMEOUT";
}

interface RequestError {
  webRevision: Positive;
  action: "play" | "pause";
  reason: "STALE_REVISION" | "REPLAY_EXPIRED" | "COMMAND_CONFLICT"
    | "REVISION_GAP" | "COUNTER_EXHAUSTED";
}

type ResultLookup =
  | { webRevision: Positive; status: "pending" | "terminal";
      result: TransportResult }
  | { webRevision: Positive; status: "notFound"; result: null };

interface OrderedResponse {
  id: string;
  event: "transportState" | "ready" | "progress" | "seeked"
    | "error" | "waiting" | "ended";
  transport: Scope & {
    version: 1;
    eventSeq: Positive;
    result?: TransportResult;
    requestError?: RequestError; // invalid/replayed submission, not a new result
    replyTo?: UUID; // bind/state request correlation, never a transport command
    lookup?: ResultLookup; // ReadState(forWebRevision), including cache absence
    snapshot: Snapshot;
  };
  position: number; // finite, >= 0, seconds; observed native position
  duration: number; // existing convention, finite >= 0; not new metadata proof
  playing: boolean; // equal to snapshot.observed.isPlaying
  playWhenReady: boolean; // equal to snapshot.observed.playWhenReady
}
```

The command identity is the tuple `(engineId, id, bindingId, webRevision)`; there is no independent command ID that can disagree with that tuple. A native intent decision and a native event each have their own counter. All three counters are scoped to that same tuple prefix, start with baseline 0 and first increment 1, and never wrap. Native creates `engineId` once per service incarnation. Each `load()` uses a new existing-format `id`. A successful bind/rebind establishes a fresh `bindingId` and resets counters while preserving native intent/output as the new baseline.

Only Play/Pause increments `webRevision`. Seek, volume, release and source lifecycle must not consume transport revisions. In ordered mode they still carry `transport:{version:1,engineId,bindingId}` and pass existing value/security checks. Every ordered **playback-state** response carries an ordered snapshot, including ready/progress/seek/error observations; those observations do not masquerade as command results. The separately typed capability/control ACK/error envelopes below are non-state replies, including Release ACK after retirement. Ordered transport uses `transportState`, never the ambiguous legacy playing/pause event names. Untagged transport feedback is never consumed in ordered mode.

Limits: keep the existing 12,288-character inbound bridge ceiling; at most two active load scopes, one pending Play and 32 terminal transport results per binding; a new revision may advance the processed watermark by at most 64. Results and outstanding bootstrap reservations are bounded independently. Validate number type, finiteness, integrality and range at both boundaries; Java `optInt`/`optLong` coercion is insufficient. Counter exhaustion invalidates the control binding and requires a new bind; no counter silently resets in place. Native audio/OS control is not restarted to repair metadata.

Deadlines proposed here: probe 1,000 ms; Bind/ReadState, lifecycle/control ACK and web Pause acknowledgement 2,000 ms; native grant/empty-load reservation 5,000 ms; native pending Play 30,000 ms; client pending Play 32,000 ms. Each request has one timer owned by its full scope/request identity. A client deadline reports unknown/error and resynchronizes; it is not evidence that native playback stopped. Lifecycle ACK timeout follows the state-read/no-automatic-retransmission rule below.

## Side-effect-free probe and explicit bind

Bootstrap messages do not assert playback success. Proposed exact control messages:

```ts
type Hello = { id: string; action: "transportHello"; requestId: UUID };
type Capabilities = {
  id: string; event: "transportCapabilities"; requestId: UUID;
  version: 1; capability: "ordered-transport-v1"; nativeBuildCode: Positive;
  engineId: UUID; currentBindingId: UUID | null;
  bindGrant: UUID; grantLifetimeMs: 5000;
};
type Bind = {
  id: string; action: "transportBind"; requestId: UUID; version: 1;
  engineId: UUID; bindingId: UUID; expectedBindingId: UUID | null;
  bindGrant: UUID;
};
type ReadState = {
  id: string; action: "transportReadState"; requestId: UUID;
  transport: Scope & { version: 1 };
  forWebRevision?: Positive;
};

type ScopedRequest = {
  id: string; requestId: UUID;
  transport: Scope & { version: 1 };
};
type LoadCommand = ScopedRequest & {
  action: "load"; url: string; title: string;
};
type SeekCommand = ScopedRequest & { action: "seek"; value: number };
type VolumeCommand = ScopedRequest & { action: "volume"; value: number };
type ReleaseCommand = ScopedRequest & { action: "release" };
type LifecycleCommand = LoadCommand | SeekCommand | VolumeCommand | ReleaseCommand;
type LifecycleAction = LifecycleCommand["action"];
type ControlAction = "transportHello" | "transportBind" | "transportReadState"
  | LifecycleAction;

type ControlAck = {
  id: string; event: "transportControlAck"; version: 1;
  requestId: UUID; scope: Scope;
} & (
  | { action: "load" | "seek"; phase: "accepted" }
  | { action: "volume" | "release"; phase: "completed" }
);
type ErrorCorrelation =
  | { action: ControlAction; requestId: UUID; attemptedScope?: Scope }
  | { action: "play" | "pause"; webRevision: Positive; attemptedScope: Scope };
type ControlError = {
  id: string; event: "transportControlError"; version: 1;
  correlation: ErrorCorrelation;
  reason: "ENGINE_MISMATCH" | "BIND_CONFLICT" | "GRANT_EXPIRED"
    | "NOT_FOUND" | "UNAVAILABLE" | "PROTOCOL_ERROR" | "INVALID_SCOPE"
    | "INVALID_VALUE" | "LOAD_CONFLICT" | "COUNTER_EXHAUSTED";
};

// Complete ordered-protocol unions. The legacy wire remains a separate mode.
type OrderedCommand = Hello | Bind | ReadState | TransportCommand | LifecycleCommand;
type OrderedWireResponse = Capabilities | OrderedResponse | ControlAck | ControlError;
```

1. Send Hello before creating a native load. Probe is read-only with respect to playback/mode: no player creation, Pause, release, source load or native mode switch. It may reserve one short-lived bind grant. The grant is a native-generated one-use nonce tied to the current trusted bridge attachment, `id`, engine and expected current binding. Keep at most four grants per attachment; reject excess reservations. Expiry uses native monotonic time; clients do not compare wall clocks. This is an IPC anti-replay nonce, not account authorization, a source credential or a renewal lease; never log its actual value.
2. Wait up to 1,000 ms. With no correlated capability response, cache legacy mode for the current bridge attachment and keep existing notification Play behavior; do not impose another probe delay on every song. Ignore a late probe reply: probing did not switch the native load into ordered mode. A recognized but malformed response is a protocol error, not permission to downgrade. After any valid capability response, that attachment is latched capable and all remaining failures use error/resync handling, never legacy fallback. Further Hello calls obtain fresh per-load/rebind grants; they cannot downgrade it.
3. Select the create or recover path below before sending Bind; do not copy an advertised null into a recovery Bind. Native checks the current trusted attachment, current engine, grant and compare-and-swap of `expectedBindingId`. A null expectation may allocate only an absent fresh ID; a non-null expectation may only rebind that existing load and must return NOT_FOUND if it is absent. This prevents an old bind arriving last from retiring a newer binding and prevents a recovery Bind from allocating a replacement. Consuming the grant creates the explicit new reservation or atomically rebinds the existing load without touching its player.
4. Return `transportState` with `replyTo` matching Bind, `eventSeq:1`, counters 0 and the current baseline snapshot. Only this correlated response makes the client active. An empty reserved load has idle/non-playing baseline; an existing load retains its current native requested intent, output and position, with `intent.origin:"baseline"` and `intent.webRevision:null`. Reap an unpopulated load reservation after 5,000 ms from its initial Bind, including when the Bind reply is lost. Duplicate Bind/rebind cannot extend that deadline; no ExoPlayer exists before Load.
5. Send the existing load command with the established scope; it creates/prepares the source once. Retrying the identical Load within the binding re-ACKs ControlAck/accepted without preparing again; use a separate ReadState for current state. Different source data under an already-loaded ID is `LOAD_CONFLICT`, requiring a fresh load ID. Releasing a load destroys its binding and grants. A replayed consumed grant cannot recreate it.

Bind/Hello/ReadState failures use ControlError with the exact action/requestId correlation above; scoped lifecycle failures use the same union. Invalid or retired Play/Pause scope uses its full attempted-scope/revision correlation, not a historical TransportResult or RequestError for an unowned scope. If malformed input lacks a safely typed correlation, drop it with bounded diagnostics; never invent an ID/scope/revision for a reply. This response has no snapshot and cannot change paused, intent, selected source or player resources. Only the matching currently outstanding request may enter error/resync; a retired request's response is ignored.

If eventSeq cannot advance, do not try to emit an ordered RequestError. Retain the exhausted binding as a non-authorizing CAS anchor and answer the next safely correlated scoped request with non-state ControlError/COUNTER_EXHAUSTED. An unsolicited observation with no request correlation is not emitted and must not fabricate a request ID. Hello/Bind remain available for recovery; no counter wraps and no player is restarted.

### New creation versus recovery

- **Create:** begin only from the normal fresh source/load decision, allocate an ID never used by that adapter, and retain the creation operation. Hello must report `currentBindingId:null`; non-null is a collision/conflict, not permission to take over an existing load. Bind uses a fresh binding ID and null expectation. After its correlated baseline, send Load for that original creation operation once. A subsequent Play requires the still-current explicit playback decision; a cancelled Play or persisted renderer snapshot cannot supply it.
- **Recover:** retain the known engine/load/binding tuple and an in-flight Bind record. Hello must report the same engine and the same non-null binding anchor. Send a new Bind expecting that retained binding, then adopt native state without Load/Play replay. Changed engine means ENGINE_MISMATCH; a null binding means the old load/reservation is absent and recovery is NOT_FOUND. Do not send a null-expectation Bind, adopt a synthetic idle baseline or resend Load/Play. An unexpected non-null binding is BIND_CONFLICT, not an identity to copy into a takeover request.
- **Lost Bind reply exception:** retain the exact in-flight Bind, including requestId/grant/new binding. If Hello reports its proposed new binding, replay that identical Bind once to recover its current snapshot. Native recognizes that exact completed Bind before grant-expiry/CAS checks and never resets it again. This is not adoption of an arbitrary advertised binding. If it has been reaped/released/replaced, replay fails and cannot recreate it. Continuing a still-live original creation after this reply is permitted; recreating a missing reservation is not.
- Keep an exhausted/temporarily non-command-authorizing binding ID as the CAS anchor while its native load still exists. Hello reports that anchor so normal recovery can replace it; it must not advertise null while retaining a player. Existing legacy-owned IDs cannot be adopted through this ordered handshake and return UNAVAILABLE; their original clients remain compatible.

These are client state-machine rules using the existing fields, not a new wire purpose flag. After missing-load/engine failure, a user recovery action may start a **new** normal creation with a fresh ID and source/playback decision; it cannot pretend to continue the old scope.

### Lifecycle/control reply semantics

Every scoped Load/Seek/Volume/Release has a unique requestId, independent of Play/Pause revisions. Bind and ReadState succeed through OrderedResponse.replyTo; Bind has no lookup, and ReadState includes lookup exactly when forWebRevision was requested. A cache-missing lookup is a successful fresh snapshot plus `{status:"notFound",result:null}`, not a failed ReadState or fabricated Play/Pause action. Pending lookup results have phase accepted; terminal lookups have phase completed/rejected. Failure of the state read itself returns correlated ControlError, with no snapshot.

For lookup notFound, the fresh snapshot may still independently satisfy the existing current-intent/observed-playing completion rule. If it does not, terminate the unresolved local Play promise with local `native_outcome_unknown` and enter the bounded state-recovery path. Do not invent a native terminal result, replay Play or leave the promise pending. This local transport outcome must not enter a generic media-error fallback that pauses/releases the current native player; newer system intent and truthful output remain intact.

Load/Seek success uses ControlAck/accepted after validation and the native API call: it does not confirm decoding or observed seek position. Later ready/seeked/progress remain ordered observations. Volume/completed confirms the setter was applied; Release/completed confirms resource/scope retirement, with no hardware-drain claim. A control ACK is not an authoritative playback snapshot and cannot resolve Play or change intent/output. No control request consumes a web transport revision.

For an already-loaded ID, a changed URL/title is ControlError/LOAD_CONFLICT under that Load's requestId, before any mutation; the existing player/binding is preserved. An identical Load retry does not prepare again. Preserve the original requestId for specifically permitted Bind/Load retries; do not reuse one for a different request. Seek/Volume/Release have no automatic retransmission in this slice: uncertain outcome requires a state read, not replay. Only Play/Pause has the revision-backed lifetime duplicate guarantee. Unknown/retired lifecycle scopes return a control failure rather than recreating resources. Do not retain credentials/raw source data in replies. A native decoder failure is separately an ordered `event:"error"` observation, not a control-request error. Existing finite-number, seek/volume clamp, title-length and asset-URL policies still apply.

### Typed wire traces for C006

The UUIDs and asset URL below are synthetic constants, not actual playback data. Bind snapshots use the complete OrderedResponse shape above; abbreviated arrows in comments describe message order without replacing a wire field.

```ts
const E = "00000000-0000-4000-8000-000000000001";
const NEW_E = "00000000-0000-4000-8000-000000000002";
const B = "00000000-0000-4000-8000-000000000003";
const OLD_B = "00000000-0000-4000-8000-000000000004";
const G = "00000000-0000-4000-8000-000000000005";
const FRESH_ID = "audio_00000000-0000-4000-8000-000000000006";
const OLD_ID = "audio_00000000-0000-4000-8000-000000000007";
const Q = "00000000-0000-4000-8000-000000000008";
const scope = { engineId: E, bindingId: B };

// CREATE: explicit fresh source decision -> fresh ID -> Hello/null -> Bind/null.
const createHello: Hello = { id: FRESH_ID, action: "transportHello", requestId: Q };
const createCaps: Capabilities = {
  id: FRESH_ID, event: "transportCapabilities", requestId: Q,
  version: 1, capability: "ordered-transport-v1", nativeBuildCode: 4,
  engineId: E, currentBindingId: null, bindGrant: G, grantLifetimeMs: 5000,
};
const createBind: Bind = {
  id: FRESH_ID, action: "transportBind",
  requestId: "00000000-0000-4000-8000-000000000009", version: 1,
  engineId: E, bindingId: B, expectedBindingId: null, bindGrant: G,
};
const bindBaseline: OrderedResponse = {
  id: FRESH_ID, event: "transportState",
  transport: { version: 1, ...scope, eventSeq: 1, replyTo: createBind.requestId,
    snapshot: { processedWebRevision: 0, appliedWebRevision: 0,
      intent: { revision: 0, playWhenReady: false, origin: "baseline", webRevision: null },
      observed: { isPlaying: false, playWhenReady: false, state: "idle",
        suppressionReason: 0, policyReason: "none" } } },
  position: 0, duration: 0, playing: false, playWhenReady: false,
};
// Only after validating this correlated counter-0 baseline:
const firstLoad: LoadCommand = {
  id: FRESH_ID, action: "load",
  requestId: "00000000-0000-4000-8000-00000000000a",
  transport: { version: 1, ...scope }, title: "Synthetic example",
  url: "https://haykasa.vercel.app/v1/assets/00000000000000000000000000000000",
};
const loadAccepted: ControlAck = {
  id: FRESH_ID, event: "transportControlAck", version: 1,
  requestId: firstLoad.requestId, action: "load", scope, phase: "accepted",
};
// New Load request for the same ID with different source data:
const conflictingLoad: LoadCommand = {
  ...firstLoad, requestId: "00000000-0000-4000-8000-00000000000b",
  url: "https://haykasa.vercel.app/v1/assets/11111111111111111111111111111111",
};
const loadConflict: ControlError = {
  id: FRESH_ID, event: "transportControlError", version: 1,
  correlation: { action: "load", requestId: conflictingLoad.requestId,
    attemptedScope: scope },
  reason: "LOAD_CONFLICT", // no reprepare, snapshot or transport result
};

// RECOVER: retained (E, OLD_ID, OLD_B); same engine now reports null.
const recoverHello: Hello = { id: OLD_ID, action: "transportHello", requestId: Q };
const missingCaps: Capabilities = { ...createCaps, id: OLD_ID };
// Client classifies NOT_FOUND: no null-expectation Bind, Load or Play.
// An optional confirmation ReadState with the retained tuple also fails:
const missingRead: ReadState = {
  id: OLD_ID, action: "transportReadState",
  requestId: "00000000-0000-4000-8000-00000000000c",
  transport: { version: 1, engineId: E, bindingId: OLD_B },
};
const readFailed: ControlError = {
  id: OLD_ID, event: "transportControlError", version: 1,
  correlation: { action: "transportReadState", requestId: missingRead.requestId,
    attemptedScope: { engineId: E, bindingId: OLD_B } },
  reason: "NOT_FOUND", // not a successful idle baseline or decoder error
};
// If the probe instead reports NEW_E, recovery classifies ENGINE_MISMATCH:
const changedEngineCaps: Capabilities = { ...missingCaps, engineId: NEW_E };
// No Bind/Load/Play against OLD_ID in this engine. Fresh creation needs a new ID.

// INVALID/RETIRED SCOPE: OLD_B command arrives while B owns FRESH_ID.
const stalePause: TransportCommand = {
  id: FRESH_ID, action: "pause",
  transport: { version: 1, engineId: E, bindingId: OLD_B, webRevision: 2 },
};
const invalidScope: ControlError = {
  id: FRESH_ID, event: "transportControlError", version: 1,
  correlation: { action: "pause", webRevision: 2,
    attemptedScope: { engineId: E, bindingId: OLD_B } },
  reason: "INVALID_SCOPE", // cannot pause B, advance its watermarks or select it
};
```

The examples are separate transactions; synthetic Q is reused only to keep independent probe examples short. Production request IDs are unique. For lost-reply recovery of a known Bind from OLD_B to B, native reports B: resend that exact original Bind/requestId/grant, not a new null-expectation Bind. If B was reaped, return NOT_FOUND; if another binding replaced B, return BIND_CONFLICT. Neither path allocates an idle replacement or issues Load/Play.

The native side only upgrades a particular load after Bind; old web clients using new load IDs retain the original legacy envelope. On an ordered load, missing/malformed scope or ordering fields cause rejection/resync and never untagged fallback. Compatibility does not mean that old APKs qualify for this fix.

## Decisions, results and authoritative snapshots

- For a well-formed in-scope revision greater than the processed watermark and within the gap limit, decide it exactly once on the native looper. Advance `processedWebRevision` even if execution is rejected; advance `appliedWebRevision` only when accepting/recording web intent, before raw mutation. Applied means that intent was recorded, not that playback succeeded: a later mutation failure retains that applied revision/decision while returning rejection and truthful output. A rejection before intent application has `decisionIntentRevision:null`. Invalid metadata, stale scopes and rejected gaps do not advance either watermark.
- Record each accepted explicit web or session transport request, including a repeated/no-op request, as a new native `intent.revision` **before** mutating the raw player. A system Play after native Pause application is fresh intent even before Pause ACK reaches JavaScript. It retains the already processed/applied web Pause revision in its snapshot. System requests have `intent.webRevision:null` and cannot be inferred from a playing callback.
- Acceptance means validation/ownership/ordering, not audible playback. Install the command record/deadline and emit `accepted` before raw mutation, because its callbacks can run synchronously. After mutation, immediately read current native state as well as handling later callbacks. An already-playing/no-op Play completes from that fresh post-command state read; it does not wait for another playing callback. A pending Play completes only on observed playing with its matching current web intent/revision and `decisionIntentRevision`.
- Pause has no native pending queue: after the synchronous raw mutation/no-op, complete if playWhenReady and isPlaying are both false. If application throws or the post-call state does not satisfy that condition, return terminal `rejected/UNAVAILABLE` with actual state instead of waiting for a callback or claiming Pause. The 2,000 ms client acknowledgement deadline covers a lost reply. These are native state guarantees, not hardware-buffer-drain or source-quality guarantees.
- A later explicit web/system intent supersedes an incomplete earlier Play, which becomes terminal `rejected/SUPERSEDED`. Terminal results are immutable. The pending-Play deadline is 30,000 ms on native monotonic time. If it expires while it still owns current intent, cancel only that intent with policy origin and return `rejected/TIMEOUT`; a newer system/web intent must survive the old timer. Application/error failures similarly return a terminal result and current actual state. Rebind/release cancels old native pending records and timers; every scheduled callback checks the full engine/load/binding/command identity before any mutation, never a reused revision alone.
- The same current/cached revision with the same action never mutates the player again, even if a system action intervened. Reply with the cached result plus a **fresh current** snapshot and event sequence. Conflicting action reuse is `requestError/COMMAND_CONFLICT`. An older revision absent from the 32-result cache returns `requestError/REPLAY_EXPIRED` without execution. The processed watermark lasts for the whole binding, independently of cache eviction. These submission errors must not replace an original immutable terminal result. A rejected gap/counter submission also uses `requestError` and triggers resynchronization rather than a fabricated command completion.
- Results describe historical commands. Snapshots describe current native state. Capture both on the owning looper; they may correctly disagree. An old Pause result can be completed while the attached snapshot says system Play is now current. `ReadState.forWebRevision` returns the cached/pending result if available plus a fresh snapshot; it does not retransmit or reapply the command.
- Automatic focus, suppression and noisy-policy observations report their actual state/reason and retain the last explicit intent identity. They do not become a system Play/Pause or increment intent revision solely because a listener fired. Explicit service cancellation (player switch, timeout) records a policy intent before raw mutation. Neither policy observations nor render/UI state repair may issue a fresh user Play.

## Consumer application and reset rules

Validate the whole response before any state change. Scope must match the active engine/load/binding and counters must be coherent: `appliedWebRevision <= processedWebRevision`, and web intent refers to an applied revision. Observed playing requires ready state, playWhenReady true and no suppression. After negotiation, absent metadata, mismatched mirrored booleans, conflicting terminal results or impossible counters are protocol errors. Unsolicited identities never select another track. Only a control response matching the current outstanding requestId can fail/bootstrap/rebind that request; a late control response cannot replace an active binding.

Process a correlated command result separately from snapshot freshness. A historical Pause result can settle its command even when its envelope has an old `eventSeq`; it must never assign current paused/intent state. A late `accepted` cannot reopen a terminal command. Process a current requestError separately from historical results: clear that failed submission's overlay and resynchronize without rewriting a previously known terminal result.

Native Play completion is qualified at the native observation time, not at delivery time. If a newer accepted snapshot has already superseded that intent, abort the still-local Play promise with AbortError; do not rewrite the native historical completed result. If a Play completion arrives with an obsolete event sequence while that Play intent remains current, do not resolve from the old envelope: use an already-fresh matching playing snapshot, or one ReadState(forWebRevision) round trip to confirm the terminal result/current intent. A fresh confirmed completion may resolve historically even if output has since buffered, but cannot announce current playing. A newer system Pause/Play makes the old local promise abort instead. State-read failure uses the bounded error/resync path, never an indefinitely pending promise. Acceptance alone never resolves Play.

Apply current snapshots only when `eventSeq` is strictly newer than the last accepted snapshot. Duplicate sequences are ignored, not applied twice; a new response gets a new sequence even for a replayed result. Always keep the freshest valid **observed** state. Keep the local pending desired-intent overlay separate: while the newest issued web revision is unprocessed, an older native intent cannot clear that pending intent. In particular, a NEW eventSeq with observed playing but processedWebRevision below a pending web Pause updates observed telemetry only: it must not emit a DOM playing event that lets nativeMediaDeck restore play intent. Once `processedWebRevision` reaches it, use native intent, whether the command applied or was rejected. A rejection must remove the failed command's overlay; an unchanged applied watermark must not deadlock the UI. A fresh system Play after native Pause application can therefore override the Pause overlay without waiting for its historical ACK. Never emit playing or resolve Play from an obsolete event name alone.

| Trigger | Required behavior |
| --- | --- |
| New source/load | Abort old pending promises with AbortError; retire old scope; create a fresh existing-format ID and bind; never accept old-load feedback. |
| Same engine/load reconnect | Stop accepting old-scope callbacks, cancel old local promises and request a new grant/bind with expected current binding. Native atomically retires old binding, cancels its pending records/timers and preserves output/intent as counter-0 baseline. Read/adopt the bound native snapshot before controls resume. No Play/Pause or persisted renderer snapshot is replayed automatically. |
| Engine restart/mismatch | Invalidate old binding and promises; fresh probe. An unknown old load returns NOT_FOUND, not an implicit reload. Recovery requires the normal source/load flow and an explicit fresh playback decision; do not fabricate continuity. |
| Bind/control timeout | After capability recognition, report transport unavailable/unknown and resynchronize; never treat timeout as proof of Pause, Play or legacy support. Bound retries: one fresh state/bind attempt per user recovery; no background retry loop. |
| WebView/attachment replacement | Old grants/sinks/bind authority are invalid. This slice does not authorize reattaching another document/account to retained playback. Cross-renderer/account restoration requires the separately reviewed ownership/reconnect contract. |
| Release/dispose/logout | Retire binding and clear pending results/grants; native resource release still follows existing ownership checks. No credentials or transport snapshot enters saved tracks/Jam. |
| Counter exhaustion | Retire control scope, keep actual native output truthful, then rebind to a new scope before ordered control resumes. Never wrap or reuse a retired binding. |

Resetting the counters is safe only with atomic scope retirement. It must not reset a live binding's watermark, reapply old commands or alter current native output. Native callbacks queued before rebind must either retain their retired scope or be rebuilt from the current native snapshot; they cannot carry stale state in the new scope.

## MediaSession interception and producer verification

Give MediaSession a `ForwardingSimpleBasePlayer` wrapper for each raw ExoPlayer. Override `handleSetPlayWhenReady(boolean)` to record explicit system intent before delegating, and `handleStop()` to record cancellation/set playWhenReady false before stopping if Stop remains advertised. Bridge commands and internal switching/cancellation operate on the raw player through the same ordered transport owner with explicit web/policy origin; they bypass the session-only system hook.

Keep one load/raw/wrapper association with one release owner. At the wrapper hook, resolve its currently bound load/scope; do not capture an older binding at an earlier session callback. Stop records one system intent, then uses raw setPlayWhenReady(false)/stop without hook re-entry. The idle wrapper has no load and advertises no transport capability/commands; a request there cannot select an arbitrary prepared scope. On active release, retire the scope, move MediaSession to the idle wrapper, then release the association once. Default forwarding release releases the raw delegate, so never independently release both wrapper and raw player. Existing legacy associations keep their legacy notification behavior.

Pinned source confirms that BasePlayer Play/Pause route through `setPlayWhenReady`, and SimpleBasePlayer calls the protected handler for allowed no-op requests. The forwarding implementation manages consistent state/listener propagation. These are source findings, not executed native tests. See [BasePlayer 1.8.0](https://github.com/androidx/media/blob/1.8.0/libraries/common/src/main/java/androidx/media3/common/BasePlayer.java#L112), [SimpleBasePlayer 1.8.0](https://github.com/androidx/media/blob/1.8.0/libraries/common/src/main/java/androidx/media3/common/SimpleBasePlayer.java#L2235) and [ForwardingSimpleBasePlayer 1.8.0](https://github.com/androidx/media/blob/1.8.0/libraries/common/src/main/java/androidx/media3/common/ForwardingSimpleBasePlayer.java#L191). [Android's player guide](https://developer.android.com/media/media3/session/player) describes this customization approach.

`session.getPlayer()` now refers to a wrapper. Use an explicit active load ID/wrapper association for the service's eviction, switching and release checks; current raw-player identity comparisons would be wrong. Keep outgoing-player internal Pause off the system wrapper. Preserve trusted-controller checks; do not exclude the app's own notification controller. Attribution may supplement the hook but is not the sole ordering mechanism.

Before qualification, test the production transport owner and wrapper, plus a real MediaController against the service: Play/Pause/setPlayWhenReady in both directions, no-op calls, notification/media keys, Stop, buffering/suppression/focus/noisy observations, wrapper listener identity, switching and active release. Assert exactly one explicit intent per allowed system request and none invented by observations. Then exercise the actual JS adapter/deck using native-produced envelopes. A hand-written fixture alone cannot establish correct native stamping.

## Required joint-review traces

Here `W` is processed/applied web revision where both match, `I` native intent revision and `S` event sequence; numbers are example trace values, not clocks.

| Case | Required result |
| --- | --- |
| web Play W1, Pause W2, delayed Play observation | Local Play aborts; a snapshot with W1 cannot clear pending Pause; native W2/I2 Pause remains current. |
| Pause while buffering/already paused | Accepted plus completed even without onIsPlayingChanged; no barrier waiting for a callback. |
| Play while already playing | New explicit intent and immediate observed completion from a fresh post-command read, with no required callback. |
| Pause ACK then system Play | System intent advances I, native output/playing can resume; no new web Play required. |
| Pause applied W2/I2/S10; system Play I3/S11 delivered before S10 Pause ACK | Apply S11 Play snapshot; settle W2 historically without applying S10 state. |
| web Play W3 after W2, then delayed W2 Pause ACK | W2 result cannot cancel W3 or set paused; complete W3 only on correlated observed playback. |
| Latest Play W3 rejected; snapshot processed=3, applied=2 | Remove W3 overlay; current observed/native intent remains visible; no watermark deadlock. |
| Duplicate W1 Play after system Pause | Return historical W1 result/current Pause snapshot, without a new Play or intent revision. |
| Reordered/duplicate accepted/terminal responses | No terminal reopening, duplicate event application or old-snapshot overwrite. |
| Historical Play completed, then newer system Pause before ACK delivery | Preserve the completed native record, abort the superseded local Play promise and retain the newer Pause snapshot. |
| Newer volume/seek while Play pending | No transport watermark increment; Play is not superseded by another command domain. |
| Old bind arrives after a newer bind; old engine/load/binding event; exhausted counter | Reject/ignore old scope; no reset of live counters or player restart. |
| Pending Play, then rebind, then its old deadline fires | Old timer is cancelled/full-scope guarded; no mutation of the preserved output or new binding. |
| Probe timeout then late response; tagged metadata malformed after bind | Legacy latch survives late probe; an active ordered binding never downgrades. A capable/new-build APK running in timed-out legacy mode is unqualified for this race fix; measure cold-start probe latency before treating 1s as a performance guarantee. |
| Policy observation or pending-Play timeout after newer system intent | No invented user command; old timer cannot pause newer native intent. |

No implementation, test execution, source-access, APK or device success is claimed by this draft. Existing confirmed defects remain open. C006 accepted the core design/initial limits; this revision requests targeted confirmation of the completed lifecycle/error union and creation/recovery rules before runtime work begins.
