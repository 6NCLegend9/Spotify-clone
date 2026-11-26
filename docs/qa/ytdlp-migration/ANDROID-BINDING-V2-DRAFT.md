# D07: native-issued Android binding identities

**Status: proposed for joint review; no runtime implementation or release.** This is the concrete response to [Codex 2 C035](https://github.com/6NCLegend9/Spotify-clone/pull/42#issuecomment-6546173431) at `edd733c`. It extends the narrow [D06 transport contract](ANDROID-TRANSPORT-DRAFT.md), whose three TypeScript blocks remain unchanged. `ordered-transport-v2` below means this binding correction, **not** the unfinished full source/queue/lease/streaming contract.

## Confirmed problem and correction

The native bridge currently accepts a renderer-chosen binding UUID after checking only the current binding. B1 → B2 → B1, B1 → B2 → B3 → B1 and Release/recreate of B1 can therefore reset an old command's authority. C035 independently confirms these sequences. The coordinator also executes all three against the actual production bridge, owner and policy: [results](evidence/native-binding-lifetime-20261031.json). These are isolated-host checks, not physical-device audio tests. The existing opt-in API33/API36 diagnostic separately confirms the first sequence on the actual service.

**Proposed correction:** native issues a fresh binding UUID with each one-use Hello grant. Bind must echo that exact issued identity. A caller cannot select a current, retired or pre-release identity. No retired-ID ledger is needed, so Release/reaping cannot erase such a ledger and no ledger capacity can block recovery.

Use the existing platform `UUID.randomUUID()` CSPRNG for both engine incarnation and issued binding IDs. Uniqueness has the standard UUID collision assumption; this is not a mathematical collision-free allocator. A binding ID is not an authorization credential: attachment/origin, engine, load, grant and CAS checks remain mandatory.

## Version negotiation and wire types

The new native binary implements ordered v2 only. The new renderer offers `[2, 1]` on **every** Hello, validates the returned version/capability pair and latches it for that attachment. Existing v1 binaries ignore the new offer and respond with their unchanged v1 contract; silent pre-D06 binaries retain the existing bounded legacy probe. Neither old-binary path is advertised as having D07 protection.

Types below reference the unchanged D06 declarations. `UUID`, `Positive`, `Snapshot`, result lookup and numeric/value limits retain their existing meaning.

```ts
type HelloV2 = Hello & { supportedTransportVersions: readonly [2, 1] };
type BindingScopeV2 = Scope & { version: 2 };

interface CapabilitiesV2 {
  id: string;
  event: "transportCapabilities";
  requestId: UUID;
  version: 2;
  capability: "ordered-transport-v2";
  nativeBuildCode: Positive;
  engineId: UUID;
  currentBindingId: UUID | null; // existing CAS anchor, including an exhausted owner
  issuedBindingId: UUID; // must be echoed; never replaced by a renderer UUID
  bindGrant: UUID;
  grantLifetimeMs: 5000;
}

type BindV2 = Omit<Bind, "version"> & { version: 2 };
type WithTransportV2<T> = T extends { transport: { version: 1 } }
  ? Omit<T, "transport"> & { transport: Omit<T["transport"], "version"> & { version: 2 } }
  : never;
type WithControlV2<T> = T extends { version: 1 }
  ? Omit<T, "version"> & { version: 2 }
  : never;

type CommandV2 = HelloV2 | BindV2
  | WithTransportV2<ReadState | TransportCommand | LifecycleCommand>;
type ResponseV2 = CapabilitiesV2 | WithTransportV2<OrderedResponse>
  | WithControlV2<ControlAck | ControlError>;

// A v1 renderer understands this denial but cannot display a new error code.
// New native UI must also show the update/reload requirement, independently of JS.
type OldRendererDenial = ControlError & { reason: "UNAVAILABLE" };
```

All v2 scoped commands, ordered states and control ACK/errors carry version 2. Apart from the capability/issued identity and explicit exhausted-scope Release below, D06 command/result/intent ordering and current-observation rules stay unchanged. No old response is relabeled v2. A malformed/recognized capability never permits a downgrade. A v2 attachment rejects v1 or untagged playback commands before mutation.

## Producer validation and lifetime

1. Validate trusted native attachment, `audio_<UUID>` ID, request UUID and offer. Hello reserves no player or playback mode. Reserve at most four grants per attachment, expire them using native monotonic time after 5 seconds and retain the two-load ceiling. Excess requests return bounded `UNAVAILABLE`; no grant or source URL enters logs.
2. Store each grant as `(attachment, engineId, loadId, expectedBindingId, issuedBindingId, expiry)`. The issued binding and grant are separate fresh native UUIDs. They are IPC nonces, not account/source/renewal credentials. Hello cannot create a grant for a foreign, detached or legacy-owned load. Repeated Hello calls issue new candidates; only a successful Bind changes the anchor.
3. Check syntactic/version/engine validity and trusted attachment first. An **exact successful Bind retry** is recognized only against the still-live load's stored Bind record, including version, ID, request ID, engine, issued binding, grant and expected anchor. It returns current state without replacing the owner or consuming a new grant. Expiry after the successful Bind does not invalidate that retry. An exhausted owner returns correlated `COUNTER_EXHAUSTED`; it is not reset by retry.
4. Otherwise validate the grant's full tuple, lifetime, exact issued binding and current CAS anchor **before** slot reservation, grant consumption, sink replacement, owner retirement or player mutation. A changed issued binding/anchor/attachment/load yields `BIND_CONFLICT` or the existing unavailable-scope error, leaves the grant unconsumed and preserves the current owner. A consumed/expired grant cannot allocate a missing load. A failed check must not turn into legacy handling.
5. On a valid Bind, reserve a slot if absent, consume that grant and atomically install the new owner. Preserve the current native intent as baseline, same player instance, source, position, gain and output. Do not call Load, Play, Pause, seek or volume. Counters start at zero only under the newly issued identity. Existing empty-load reaping still expires 5 seconds after initial reservation; rebind/retry does not extend it.
6. On Release, reaping or eviction, remove the load and all its outstanding grants and retire its owner. Do not retain a completed Bind retry record after removal. A later Hello for a recreated ID issues a fresh identity; supplying B1 with that grant fails. Replaying the original consumed B1 Bind also fails. Engine recreation generates a fresh engine ID, so pre-restart scopes are rejected. No Release or reaping path resets a native-issued identity allocator because there is no counter/ledger allocator.

## Counter exhaustion, recovery and Release

Web revision, native intent revision and event sequence never wrap. An exhausted owner remains a **non-authorizing CAS anchor** while its player exists. Hello reports that same non-null anchor; a valid fresh v2 grant permits rebind without changing playback. The renderer adopts its correlated new baseline and reads native intent; it never replays the old Load/Play/seek/volume or uses an old paused snapshot as fresh intent.

**Explicit v2 change:** after validating attachment and full current scope, Release is allowed even if the owner is exhausted. It retires resources and returns a correlated version-2 `ControlAck/completed`, which needs no event sequence. Other scoped commands/state reads still receive `COUNTER_EXHAUSTED`. Release from a retired scope remains invalid. This closes the current "exhausted owner rejects Release" recovery trap without granting unscoped teardown authority. A lost Release ACK is still uncertain outcome; no automatic retransmission or implicit replacement source.

An exact lost-Bind retry is accepted only while its owner still exists. If its scope was replaced, released, reaped or its engine changed, bounded recovery reports conflict/missing/engine mismatch. A user may then make an explicit fresh source/play decision with a fresh load ID. Do not manufacture continuous playback or restart audio during protocol repair.

## Compatibility and visible update behavior

| Renderer / native binary | Behavior |
| --- | --- |
| New renderer / new v2 binary | Negotiate v2, adopt native-issued identity, use v2 producer and consumer checks. Native change requires a new APK; a web deployment cannot install it. |
| New renderer / current v1 binary | Continue the unchanged v1 protocol and show that an app update is required for the ordering correction. No v2/D07 protection claim. Existing counters, Pause behavior and capability validation remain. |
| New renderer / silent pre-D06 binary | Existing one-second legacy probe and ordinary controls remain compatible. Advertise legacy capability and the update requirement, not ordered guarantees. |
| Old v1 renderer / new v2 binary | Hello without a supported v2 offer receives correlated **v1** `ControlError/UNAVAILABLE`, without a capability/grant or playback mutation. Native host also displays "Player update required" with an explicit Reload action; merely adding an unused field is insufficient. |
| Pre-D06 renderer / new v2 binary | Reject untagged renderer playback commands. Use the same native update surface. OS MediaSession controls remain separate authorized entry points and continue to work. |

The native update surface must reuse the existing host error/content presentation where possible, with a localized explanatory message and a user-triggered reload of the fixed trusted origin. It must work if old JavaScript cannot parse a new field. Show it once per affected attachment, do not reload automatically, inject source URLs, open an external browser or pause/release current native output. Once shown, suppress old renderer playback commands until a newly attached, correctly negotiated renderer exists. Replacing a renderer is not a claim of D06 ownership transfer; a new source needs its normal fresh creation decision.

The host and new shared player UI are part of the correction, not documentation-only promises. A minimum native build/version is allocated at implementation from the next unused build code; do not publish or claim installation during this review stage. Desktop/browser engines do not use this Android bridge and must retain existing controls.

## Connected implementation boundaries

| Existing path | Required coordinated change |
| --- | --- |
| [MainActivity](../../../android/app/src/main/java/app/haykasa/android/MainActivity.java) | Keep trusted-origin/main-frame/attachment checks. Route compatibility denial to the native update surface; reject invalid legacy Play before starting its service. No update dialog may mutate current playback. |
| [OrderedMediaBridge](../../../android/app/src/main/java/app/haykasa/android/OrderedMediaBridge.java) | Negotiate v2, issue and validate the complete grant tuple, version every state/control reply, preserve exact retries and permit exhausted-scope Release after scope validation. |
| [PlaybackService](../../../android/app/src/main/java/app/haykasa/android/PlaybackService.java) and [OrderedTransport](../../../android/app/src/main/java/app/haykasa/android/OrderedTransport.java) | Keep single-looper ownership, OS controls, actual state and release/forget behavior aligned with the new bridge. Rebind does not replace or write to the player. |
| [Ordered adapter](../../../src/components/MusicPlayer/media/orderedAndroidTransport.mjs), [Android element](../../../src/components/MusicPlayer/media/androidAudioElement.mjs), [native deck](../../../src/components/MusicPlayer/media/nativeMediaDeck.mjs) and [shared player](../../../src/components/MusicPlayer/YouTubePlayer.jsx) | Offer versions, adopt the issued identity, validate the selected version, preserve latest intent and bounded recovery, and expose old-native update requirements without a source-error fallback. |
| [Android build](../../../android/app/build.gradle), resources and [ordered service tests](../../../android/app/src/androidTest/java/app/haykasa/android/OrderedBridgeTest.java) | Include native UI/producer changes in a newly versioned APK and normal regressions. Backend, storage, account/guest grants, catalog and persisted songs are outside this narrow revision and receive no changes. |

## Typed traces

The following values are synthetic. They are not actual grants, credentials or playback state.

```ts
const d07E = "00000000-0000-4000-8000-000000000001";
const d07B1 = "00000000-0000-4000-8000-000000000002";
const d07B2 = "00000000-0000-4000-8000-000000000003";
const d07B3 = "00000000-0000-4000-8000-000000000004";
const d07G = "00000000-0000-4000-8000-000000000005";
const d07Q = "00000000-0000-4000-8000-000000000006";
const d07Id = "audio_00000000-0000-4000-8000-000000000007";
const d07Hello: HelloV2 = {
  id: d07Id, action: "transportHello", requestId: d07Q,
  supportedTransportVersions: [2, 1],
};
const d07Caps: CapabilitiesV2 = {
  id: d07Id, event: "transportCapabilities", requestId: d07Q,
  version: 2, capability: "ordered-transport-v2", nativeBuildCode: 5,
  engineId: d07E, currentBindingId: d07B2, issuedBindingId: d07B3,
  bindGrant: d07G, grantLifetimeMs: 5000,
};
// B2 can be exhausted and remains the exact recovery anchor.
const d07Recover: BindV2 = {
  id: d07Id, action: "transportBind",
  requestId: "00000000-0000-4000-8000-000000000008", version: 2,
  engineId: d07E, expectedBindingId: d07B2,
  bindingId: d07Caps.issuedBindingId, bindGrant: d07G,
};
// Well-typed wire input can still be hostile; tuple validation must reject B1.
const d07AttemptRetired: BindV2 = {
  ...d07Recover, requestId: "00000000-0000-4000-8000-000000000009", bindingId: d07B1,
};
const d07Reject: WithControlV2<ControlError> = {
  id: d07Id, event: "transportControlError", version: 2,
  correlation: { action: "transportBind", requestId: d07AttemptRetired.requestId,
    attemptedScope: { engineId: d07E, bindingId: d07B1 } },
  reason: "BIND_CONFLICT",
};
// Same validated current scope may be released even when counters are exhausted.
const d07Release: WithTransportV2<ReleaseCommand> = {
  id: d07Id, action: "release", requestId: "00000000-0000-4000-8000-00000000000a",
  transport: { version: 2, engineId: d07E, bindingId: d07B2 },
};
const d07ReleaseAck: WithControlV2<ControlAck> = {
  id: d07Id, event: "transportControlAck", version: 2,
  requestId: d07Release.requestId, action: "release", phase: "completed",
  scope: { engineId: d07E, bindingId: d07B2 },
};
const d07OldRendererDenial: OldRendererDenial = {
  id: d07Id, event: "transportControlError", version: 1,
  correlation: { action: "transportHello", requestId: d07Q }, reason: "UNAVAILABLE",
};
```

The Hello, successful recovery, malicious Bind and Release each have distinct request IDs; replies retain their matching request ID. Bind lost-reply retries retain the complete original request ID and envelope. Type checking these examples proves consistency only; it does not execute the proposed validation or prove device behavior.

## Implementation acceptance and joint review

Before runtime edits, Codex 2 must confirm the exact v2 fields/denial and compatibility matrix, native visible update path, exhausted-scope Release exception and recovery baseline. This is the existing shared-contract review boundary, not a new user permission request. The original v1 document remains frozen. After agreement:

1. Change the native producer/service/host UI and shared adapter/deck/player UI together; increment the native binary version and retain required origin/security controls.
2. Promote the retired-binding diagnostic into the **normal** Android regression suite, adapting it to negotiated v2. Add B1 → B2 → B3 → B1 and Release/recreate replay cases. Both current-ID and every retired-ID attempt must preserve the latest Pause, watermark and player identity; old Play must remain invalid.
3. Test altered grant tuples before mutation, exact lost-Bind retry before/after expiry, consumed-grant replay after Release/reaping, foreign attachment/engine, all counter exhaustion/rebind/release paths and grant/slot bounds. Require unchanged player/source/position/gain and zero transport writes during successful rebind.
4. Exercise actual producer/consumer version combinations, native update UI, bounded Play recovery and notification Play/Pause on API33/API36. Run LF/CRLF component checks on Windows and desktop/browser controls to prevent sibling regressions. Include captured UI and XML artifacts, not just successful compilation.
5. Reconcile N02g only after the correction and actual-service cases pass. Published APK installation, physical audio, screen-off queue/renewal/reconnect and the independent source-access gate remain separate requirements. PR42 stays draft; no production activation, merge or release.
