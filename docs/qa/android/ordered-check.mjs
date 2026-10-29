// Actual production consumer with scripted protocol envelopes, not native/device proof.
// Android instrumentation separately exercises the production producer and MediaController.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createAndroidAudioElement } from "../../../src/components/MusicPlayer/media/androidAudioElement.mjs";

const copy = value => JSON.parse(JSON.stringify(value));
const E = "00000000-0000-4000-8000-000000000001";
const G = "00000000-0000-4000-8000-000000000002";
const assetUrl = "https://haykasa.vercel.app/v1/assets/00000000000000000000000000000000";
const originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
let now = 0, timerId = 0;
const timers = new Map();
globalThis.setTimeout = (callback, ms) => { const id = ++timerId; timers.set(id, { callback, at: now + ms, ms }); return id; };
globalThis.clearTimeout = id => timers.delete(id);
function tick(ms) {
  const target = now + ms;
  for (;;) {
    const due = [...timers.entries()].filter(([, task]) => task.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
    if (!due) break;
    now = due[1].at; timers.delete(due[0]); due[1].callback();
  }
  now = target;
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const track = promise => {
  const result = { state: "pending" };
  promise.then(() => { result.state = "resolved"; }, error => { result.state = "rejected"; result.error = error; });
  return result;
};

class Native {
  constructor({ legacy = false, malformedCapabilities = false } = {}) {
    this.legacy = legacy; this.sent = []; this.history = new Map(); this.seq = 0;
    this.malformedCapabilities = malformedCapabilities;
    this.processed = 0; this.applied = 0;
    this.intent = { revision: 0, playWhenReady: false, origin: "baseline", webRevision: null };
    this.observed = { isPlaying: false, playWhenReady: false, state: "idle", suppressionReason: 0, policyReason: "none" };
    this.position = 0;
    this.bridge = { postMessage: raw => this.post(JSON.parse(raw)) };
    globalThis.window = { HayKasaAndroidMedia: this.bridge };
    globalThis.location = { origin: "https://haykasa.vercel.app" };
    globalThis.document = { createElement: () => Object.assign(new EventTarget(), {
      style: {}, setAttribute() {}, removeAttribute() {}, remove() {},
    }) };
    this.audio = createAndroidAudioElement("Synthetic ordered fixture");
    this.events = [];
    for (const name of ["loadedmetadata", "playing", "pause", "waiting", "ended", "transportintent", "transporterror", "transportrecovered", "error"])
      this.audio.addEventListener(name, () => this.events.push(name));
    this.audio.src = assetUrl; this.audio.load();
  }
  deliver(value) { this.bridge.onmessage({ data: JSON.stringify(value) }); }
  last(action) { return this.sent.findLast(value => value.action === action); }
  scope() { return { engineId: E, bindingId: this.binding }; }
  post(command) {
    this.sent.push(copy(command));
    if (command.action === "transportHello") {
      if (this.legacy) return;
      const existing = command.id === this.id;
      this.id = command.id;
      this.deliver({ id: this.id, event: "transportCapabilities", requestId: command.requestId,
        version: 1, capability: "ordered-transport-v1", nativeBuildCode: this.malformedCapabilities ? null : 4, engineId: this.engine || E,
        currentBindingId: existing ? this.binding || null : null, bindGrant: G, grantLifetimeMs: 5000 });
    } else if (command.action === "transportBind") {
      this.id = command.id; this.binding = command.bindingId; this.seq = 0;
      this.processed = 0; this.applied = 0; this.history.clear();
      this.intent = { revision: 0, playWhenReady: this.intent.playWhenReady, origin: "baseline", webRevision: null };
      this.frame({ replyTo: command.requestId });
    } else if (command.action === "load") {
      this.id = command.id;
      this.observed = { isPlaying: false, playWhenReady: false, state: "ready", suppressionReason: 0, policyReason: "none" };
      if (command.transport) { this.ack(command); this.frame({ event: "ready" }); }
      else this.deliver({ id: this.id, event: "ready", duration: 200, position: 0 });
    } else if (["volume", "seek"].includes(command.action) && command.transport) {
      if (this.holdAck !== command.action) this.ack(command);
    } else if (command.action === "transportReadState") {
      if (!this.holdRead) this.readState(command);
    } else if (command.action === "release" && command.id === this.id
      && (!command.transport || command.transport.bindingId === this.binding)) this.binding = null;
  }
  ack(command) {
    this.deliver({ id: command.id, event: "transportControlAck", version: 1,
      action: command.action, requestId: command.requestId, scope: this.scope(),
      phase: ["load", "seek"].includes(command.action) ? "accepted" : "completed" });
  }
  readState(command) {
    const revision = command.forWebRevision, result = this.history.get(revision);
    this.frame({ replyTo: command.requestId, ...(revision === undefined ? {} : {
      lookup: { webRevision: revision, status: result ? result.phase === "accepted" ? "pending" : "terminal" : "notFound", result: result || null },
    }) });
  }
  frame({ event = "transportState", deliver = true, ...extra } = {}) {
    const packet = copy({ id: this.id, event, transport: { version: 1, ...this.scope(), eventSeq: ++this.seq,
      snapshot: { processedWebRevision: this.processed, appliedWebRevision: this.applied,
        intent: this.intent, observed: this.observed }, ...extra },
      position: this.position, duration: this.observed.state === "idle" ? 0 : 200,
      playing: this.observed.isPlaying, playWhenReady: this.observed.playWhenReady });
    if (deliver) this.deliver(packet);
    return packet;
  }
  decide(command, { complete = true, deliver = true } = {}) {
    const revision = command.transport.webRevision, playing = command.action === "play";
    this.processed = revision; this.applied = revision;
    this.intent = { revision: this.intent.revision + 1, playWhenReady: playing, origin: "web", webRevision: revision };
    const result = { webRevision: revision, action: command.action, phase: "accepted", decisionIntentRevision: this.intent.revision };
    this.history.set(revision, copy(result));
    this.frame({ result, deliver });
    this.observed = { isPlaying: playing && complete, playWhenReady: playing,
      state: playing && !complete ? "buffering" : "ready", suppressionReason: 0, policyReason: "none" };
    if (complete) {
      result.phase = "completed"; this.history.set(revision, copy(result));
      return this.frame({ result, deliver });
    }
    return null;
  }
  system(playing) {
    this.intent = { revision: this.intent.revision + 1, playWhenReady: playing, origin: "system", webRevision: null };
    this.observed = { isPlaying: playing, playWhenReady: playing, state: "ready", suppressionReason: 0, policyReason: "none" };
    return this.frame();
  }
  failControl(action = "volume") {
    this.holdAck = action;
    if (action === "volume") this.audio.volume = .4;
    const command = this.last(action);
    this.deliver({ id: this.id, event: "transportControlError", version: 1,
      correlation: { action, requestId: command.requestId, attemptedScope: this.scope() }, reason: "UNAVAILABLE" });
    this.holdAck = null;
  }
}

let passed = 0;
async function check(name, run, options) {
  const native = new Native(options);
  try { await run(native); passed++; console.log(`PASS ${name}`); }
  finally { native.audio.remove(); }
}

try {
  await check("delayed old playing cannot undo explicit Pause", async n => {
    const play = track(n.audio.play());
    const old = n.decide(n.last("play"), { deliver: false });
    n.audio.pause(); n.decide(n.last("pause")); n.deliver(old); await flush();
    assert.equal(play.error.name, "AbortError"); assert.equal(n.audio.paused, true);
    assert.equal(n.events.filter(event => event === "playing").length, 0);
  });
  await check("later web Play survives older Pause ACK", async n => {
    const first = track(n.audio.play()); n.decide(n.last("play")); await flush(); assert.equal(first.state, "resolved");
    n.audio.pause(); const old = n.decide(n.last("pause"), { deliver: false });
    const next = track(n.audio.play()); n.decide(n.last("play")); n.deliver(old); await flush();
    assert.equal(next.state, "resolved"); assert.equal(n.audio.paused, false);
  });
  await check("notification Play wins before Pause ACK delivery", async n => {
    const first = track(n.audio.play()); n.decide(n.last("play")); await flush();
    n.audio.pause(); const old = n.decide(n.last("pause"), { deliver: false });
    n.system(true); n.deliver(old); await flush();
    assert.equal(first.state, "resolved"); assert.equal(n.audio.nativePlayIntent, true); assert.equal(n.audio.paused, false);
    assert.equal(n.events.filter(event => event === "playing").length, 2);
    assert.equal(n.sent.filter(value => value.action === "play").length, 1, "No synthetic corrective web Play");
  });
  await check("acceptance and buffering do not complete Play", async n => {
    const result = track(n.audio.play()); n.decide(n.last("play"), { complete: false });
    n.frame({ event: "waiting" }); await flush(); assert.equal(result.state, "pending");
    const command = n.last("play"), cached = n.history.get(command.transport.webRevision);
    cached.phase = "completed"; n.observed = { ...n.observed, state: "ready", isPlaying: true };
    n.frame({ result: cached }); await flush(); assert.equal(result.state, "resolved");
  });
  await check("new system Pause supersedes historical Play completion", async n => {
    const result = track(n.audio.play()); const old = n.decide(n.last("play"), { deliver: false });
    n.system(false); n.deliver(old); await flush();
    assert.equal(result.error.name, "AbortError"); assert.equal(n.audio.paused, true);
  });
  await check("no-op Pause ACK clears its deadline", async n => {
    const result = track(n.audio.play()); n.decide(n.last("play"), { complete: false });
    n.frame({ event: "waiting" }); n.audio.pause(); n.decide(n.last("pause")); await flush();
    tick(2500); assert.equal(result.error.name, "AbortError");
    assert.equal(n.audio.nativeTransportError, null); assert(n.events.includes("pause"));
  });
  await check("malformed active metadata fails closed without pausing audio", async n => {
    const result = track(n.audio.play()); n.decide(n.last("play")); await flush();
    const malformed = n.frame({ deliver: false }); malformed.playing = false; n.deliver(malformed);
    assert.equal(result.state, "resolved"); assert.equal(n.audio.nativeTransportError.code, "PROTOCOL_ERROR");
    assert.equal(n.audio.orderedTransport, true);
    assert.equal(n.sent.filter(value => value.action === "pause").length, 0);
    assert.equal(n.sent.filter(value => value.action === "load").length, 1);
  });
  await check("control error is distinct from decoder error", async n => {
    const result = track(n.audio.play()); n.decide(n.last("play")); await flush(); n.failControl();
    assert.equal(result.state, "resolved"); assert(n.events.includes("transporterror")); assert(!n.events.includes("error"));
    assert.equal(n.sent.filter(value => value.action === "pause").length, 0);
  });
  await check("rebind adopts native state without Play or Load replay", async n => {
    const result = track(n.audio.play()); n.decide(n.last("play")); await flush();
    const previous = n.scope(); n.position = 42; n.failControl(); await n.audio.reconnectTransport();
    assert.equal(result.state, "resolved"); assert.equal(n.audio.currentTime, 42);
    assert.notEqual(n.binding, previous.bindingId); assert.equal(n.audio.nativeTransportError, null);
    assert.equal(n.sent.filter(value => value.action === "load").length, 1);
    assert.equal(n.sent.filter(value => value.action === "play").length, 1);
  });
  await check("missing load never becomes a new empty baseline", async n => {
    n.failControl(); n.binding = null;
    await assert.rejects(n.audio.reconnectTransport(), error => error.needsSource && error.code === "NOT_FOUND");
    assert.equal(n.sent.filter(value => value.action === "transportBind").length, 1);
    assert.equal(n.sent.filter(value => value.action === "load").length, 1);
  });
  await check("client Play deadline reports unknown without corrective Pause", async n => {
    const result = track(n.audio.play()); n.decide(n.last("play"), { deliver: false });
    tick(32_001); await flush();
    assert.equal(result.error.nativeTransport, true); assert.equal(n.observed.isPlaying, true);
    assert.equal(n.sent.filter(value => value.action === "pause").length, 0);
  });
  await check("queued old deadline cannot undo completed playback", async n => {
    const result = track(n.audio.play()); const stale = [...timers.values()].find(value => value.ms === 32_000).callback;
    n.decide(n.last("play")); await flush(); stale();
    assert.equal(result.state, "resolved"); assert.equal(n.audio.nativeTransportError, null);
  });
  await check("obsolete completion requires fresh state confirmation", async n => {
    const result = track(n.audio.play()); const old = n.decide(n.last("play"), { deliver: false });
    n.observed = { ...n.observed, isPlaying: false, state: "buffering" }; n.frame({ event: "waiting" });
    n.deliver(old); await flush();
    assert.equal(result.state, "resolved"); assert(n.last("transportReadState"));
    assert.equal(n.audio.nativeObservedPlaying, false);
    assert.equal(n.events.filter(event => event === "playing").length, 0);
  });
  // A lifecycle ACK timeout may already own the one allowed state read when
  // an old Play completion needs its own correlated result confirmation.
  for (const respond of [true, false]) await check(`overlapping Play confirmation ${respond ? "completes" : "times out visibly"}`, async n => {
    const result = track(n.audio.play()), command = n.last("play");
    const old = n.decide(command, { deliver: false });
    n.observed = { ...n.observed, isPlaying: false, state: "buffering" }; n.frame({ event: "waiting" });
    n.holdRead = true; n.holdAck = "volume"; n.audio.volume = .4;
    tick(2000);
    const general = n.last("transportReadState");
    assert.equal(general.forWebRevision, undefined);
    n.holdAck = null; // Only the initial ACK is lost; repeated Play's volume ACK succeeds.
    n.deliver(old); n.deliver(old);
    const repeated = track(n.audio.play());
    n.readState(general); await flush();
    const confirmation = n.last("transportReadState");
    assert.notEqual(confirmation.requestId, general.requestId, "Required lookup must survive an outstanding general read");
    assert.equal(confirmation.forWebRevision, command.transport.webRevision);
    assert.equal(n.sent.filter(value => value.action === "transportReadState").length, 2, "Repeated completion coalesces one confirmation");
    if (respond) {
      n.readState(confirmation); await flush();
      assert.equal(result.state, "resolved"); assert.equal(repeated.state, "resolved");
      assert.equal(n.audio.nativeTransportError, null);
      assert.equal(n.events.filter(event => event === "playing").length, 0, "Historical completion does not invent audible output");
    } else {
      tick(2001); await flush();
      assert.equal(result.error.code, "TIMEOUT"); assert.equal(repeated.error.code, "TIMEOUT");
      assert.equal(n.audio.nativeTransportError.code, "TIMEOUT");
    }
    tick(40_000); await flush();
    assert.notEqual(result.state, "pending"); assert.notEqual(repeated.state, "pending");
    assert.equal(n.sent.filter(value => value.action === "pause").length, 0);
    assert.equal(n.sent.filter(value => value.action === "load").length, 1);
  });
  await check("queued confirmation retains the original Play deadline", async n => {
    const result = track(n.audio.play()), old = n.decide(n.last("play"), { deliver: false });
    n.observed = { ...n.observed, isPlaying: false, state: "buffering" }; n.frame({ event: "waiting" });
    tick(29_000);
    n.holdRead = true; n.holdAck = "volume"; n.audio.volume = .4;
    tick(2000); const general = n.last("transportReadState");
    n.deliver(old); tick(900); n.readState(general);
    tick(101); await flush();
    assert.equal(result.error.code, "TIMEOUT", "Confirmation must not clear or extend the 32-second deadline");
    assert.equal(n.audio.nativeTransportError.code, "TIMEOUT");
    n.readState(n.last("transportReadState")); await flush();
    assert.equal(result.state, "rejected", "A late read cannot reopen a settled request");
    assert.equal(n.sent.filter(value => value.action === "pause").length, 0);
  });
  await check("late acceptance cannot reopen a terminal Play result", async n => {
    const result = track(n.audio.play()); const command = n.last("play");
    n.decide(command); await flush();
    const accepted = { ...n.history.get(command.transport.webRevision), phase: "accepted" };
    n.frame({ result: accepted }); tick(32_001); await flush();
    assert.equal(result.state, "resolved"); assert.equal(n.audio.nativeTransportError, null);
  });
  await check("pre-application rejection is an error rather than a user Pause", async n => {
    const result = track(n.audio.play()); const command = n.last("play");
    n.processed = command.transport.webRevision;
    n.frame({ result: { webRevision: n.processed, action: "play", phase: "rejected", decisionIntentRevision: null, reason: "UNAVAILABLE" } });
    await flush(); assert.equal(result.error.nativeTransport, true); assert.equal(result.error.code, "UNAVAILABLE");
    assert.equal(n.sent.filter(value => value.action === "pause").length, 0);
  });
  await check("retired binding results cannot settle a new revision", async n => {
    const first = track(n.audio.play()); const old = n.decide(n.last("play")); await flush();
    n.failControl(); await n.audio.reconnectTransport(); n.system(false);
    const next = track(n.audio.play()); n.deliver(old); await flush();
    assert.equal(next.state, "pending"); n.decide(n.last("play")); await flush();
    assert.equal(first.state, "resolved"); assert.equal(next.state, "resolved"); assert.equal(n.audio.nativeTransportError, null);
  });
  await check("fresh Pause during recovery remains pending until its own acknowledgement", async n => {
    const first = track(n.audio.play()); n.decide(n.last("play")); await flush(); n.failControl();
    n.audio.pause(); const pause = n.last("pause");
    assert.equal(first.state, "resolved"); assert.equal(n.audio.nativePlayIntent, false);
    n.frame(); assert.equal(n.audio.nativePlayIntent, false); assert.equal(n.audio.paused, true);
    n.decide(pause); tick(2500); assert.equal(n.audio.nativeTransportError, null);
  });
  await check("bounded lifecycle requests fail visibly without stopping the decoder", async n => {
    const first = track(n.audio.play()); n.decide(n.last("play")); await flush();
    n.holdAck = "volume";
    for (let i = 0; i < 40; i++) n.audio.volume = .5;
    assert.equal(first.state, "resolved"); assert.equal(n.audio.nativeTransportError.code, "UNAVAILABLE");
    assert(n.sent.filter(value => value.action === "volume").length < 36);
    assert.equal(n.observed.isPlaying, true); assert.equal(n.sent.filter(value => value.action === "pause").length, 0);
  });
  await check("invalid ordered counters never become playback authority", async n => {
    const invalid = [null, -1, .5, "1", Number.MAX_SAFE_INTEGER + 1];
    for (const eventSeq of invalid) {
      const frame = n.frame({ deliver: false }); frame.transport.eventSeq = eventSeq;
      n.deliver(frame);
      assert.equal(n.audio.nativeTransportError.code, "PROTOCOL_ERROR");
      await n.audio.reconnectTransport();
    }
    assert.equal(n.sent.filter(value => value.action === "load").length, 1);
    assert.equal(n.sent.filter(value => value.action === "play").length, 0);
  });
  await check("recognized malformed capability cannot downgrade to legacy", async n => {
    tick(1001);
    assert.equal(n.audio.orderedTransport, true); assert.equal(n.audio.nativeTransportError.code, "PROTOCOL_ERROR");
    assert(!n.last("load")); assert(!n.last("play")); assert(!n.last("transportBind"));
  }, { malformedCapabilities: true });
  await check("old APK fallback is cached and notification Play remains compatible", async n => {
    tick(1000); assert.equal(n.audio.orderedTransport, false);
    const result = track(n.audio.play()); n.deliver({ id: n.id, event: "playing", position: 1, duration: 200 }); await flush();
    assert.equal(result.state, "resolved");
    n.audio.pause(); n.deliver({ id: n.id, event: "playing", position: 2, duration: 200 });
    assert.equal(n.audio.paused, false, "Legacy remains compatible, not qualified for the race fix");
    const hello = n.last("transportHello");
    n.deliver({ id: n.id, event: "transportCapabilities", requestId: hello.requestId,
      version: 1, capability: "ordered-transport-v1", nativeBuildCode: 4, engineId: E,
      currentBindingId: null, bindGrant: G, grantLifetimeMs: 5000 });
    assert.equal(n.audio.orderedTransport, false); assert(!n.last("transportBind"), "Late capability cannot upgrade a cached legacy attachment");
    n.audio.load(); assert.equal(n.last("load").id, n.id);
    assert.equal(n.sent.filter(value => value.action === "transportHello").length, 1);
  }, { legacy: true });
  // Use the real deck AND real adapter, replacing only the resolver and graph.
  // These envelopes remain scripted; the APK fixture covers the real producer.
  let deckSource = await readFile(new URL("../../../src/components/MusicPlayer/media/nativeMediaDeck.mjs", import.meta.url), "utf8");
  for (const name of ["mediaPlayerStates", "androidAudioElement"])
    deckSource = deckSource.replace(`"./${name}.mjs"`, JSON.stringify(new URL(`../../../src/components/MusicPlayer/media/${name}.mjs`, import.meta.url).href));
  const resolver = `export const cancelMediaReceipt=()=>{};export const resolveMediaAsset=async()=>({receipt:"synthetic",asset:{url:${JSON.stringify(assetUrl)},duration:200,expiresAt:Date.now()+3600000}});`;
  deckSource = deckSource.replace('"./resolveMediaAsset.mjs"', JSON.stringify("data:text/javascript;base64," + Buffer.from(resolver).toString("base64")));
  deckSource = deckSource.replace('"./nativeAudioGraph.mjs"', '"data:text/javascript,export const createNativeAudioGraph=()=>null"');
  const { createNativeMediaDeck } = await import("data:text/javascript;base64," + Buffer.from(deckSource).toString("base64"));
  await check("qualified deck ignores stale output and preserves notification Play", async n => {
    n.audio.remove();
    const intents = [], states = [], errors = [], fallbacks = [];
    const deck = createNativeMediaDeck({ host: { replaceChildren() {} }, videoId: "synthetic01", mode: "audio", autoplay: false,
      events: { onStateChange: e => states.push(e.data), onTransportIntent: e => intents.push(e.data.playing), onTransportError: e => errors.push(e.data) },
      onFallback: value => fallbacks.push(value) });
    await flush();
    n.audio = deck.getIframe();
    assert.equal(deck.orderedTransport, true); assert.equal(deck.getPlayerState(), 5);
    deck.playVideo(); const old = n.decide(n.last("play"), { deliver: false });
    deck.pauseVideo();
    // Fresh progress with an old processed revision must not undo local Pause.
    n.frame(); n.deliver(old); await flush();
    assert(!states.includes(1)); assert.equal(deck.nativePlayIntent, false);
    const pauseAck = n.decide(n.last("pause"), { deliver: false });
    n.system(true); n.deliver(pauseAck); await flush();
    assert.equal(deck.getPlayerState(), 1); assert.equal(deck.nativePlayIntent, true); assert.equal(intents.at(-1), true);
    assert.equal(n.sent.filter(value => value.action === "play").length, 1);
    n.position = 47;
    n.failControl(); assert.equal(errors.length, 1); assert.equal(fallbacks.length, 0);
    const before = n.sent.length;
    await deck.reconnectControls();
    assert.equal(deck.getCurrentTime(), 47); assert.equal(deck.getPlayerState(), 1);
    assert(!n.sent.slice(before).some(value => ["play", "load", "seek", "volume"].includes(value.action)), "Rebind never replays renderer output/position/intent");
    const beforeDestroy = n.sent.length;
    deck.destroy();
    assert(!n.sent.slice(beforeDestroy).some(value => value.action === "pause"), "Lifecycle release is not a new user Pause");
    assert.equal(n.last("release").transport.version, 1);
  });
  await check("qualified deck transport failure does not retry the source or release playback", async n => {
    n.audio.remove(); const failures = [], transport = [];
    const deck = createNativeMediaDeck({ host: { replaceChildren() {} }, videoId: "synthetic01", mode: "audio", autoplay: false,
      events: { onTransportError: e => transport.push(e.data) }, onFallback: value => failures.push(value) });
    await flush(); n.audio = deck.getIframe();
    deck.playVideo(); n.decide(n.last("play"), { deliver: false });
    const before = n.sent.length;
    tick(32_001); await flush();
    assert.equal(transport.length, 1); assert.equal(failures.length, 0); assert.equal(n.observed.isPlaying, true);
    assert(!n.sent.slice(before).some(value => ["pause", "release", "load", "play"].includes(value.action)));
    deck.destroy();
  });
  console.log(`Ordered Android consumer checks passed: ${passed} cases (scripted protocol fixtures; no device/source/audio claim).`);
} finally {
  globalThis.setTimeout = originalSet; globalThis.clearTimeout = originalClear;
}
