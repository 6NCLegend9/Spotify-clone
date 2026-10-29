// D06 is an additive native capability. A silent old APK stays in legacy mode;
// after capability recognition, failure never silently becomes legacy playback.
const attachments = new WeakMap();
const uuid = value => typeof value === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const safe = (value, positive = false) => Number.isSafeInteger(value) && value >= (positive ? 1 : 0);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const origins = new Set(["baseline", "web", "system", "policy"]);
const states = new Set(["idle", "buffering", "ready", "ended"]);
const policies = new Set(["none", "focus", "noisy", "switch", "timeout", "other"]);
const resultReasons = new Set(["SUPERSEDED", "UNAVAILABLE", "PLAYER_ERROR", "TIMEOUT"]);
const requestReasons = new Set(["STALE_REVISION", "REPLAY_EXPIRED", "COMMAND_CONFLICT", "REVISION_GAP", "COUNTER_EXHAUSTED"]);
const controlReasons = new Set(["ENGINE_MISMATCH", "BIND_CONFLICT", "GRANT_EXPIRED", "NOT_FOUND", "UNAVAILABLE", "PROTOCOL_ERROR", "INVALID_SCOPE", "INVALID_VALUE", "LOAD_CONFLICT", "COUNTER_EXHAUSTED"]);
const stateEvents = new Set(["transportState", "ready", "progress", "seeked", "error", "waiting", "ended"]);
const abort = () => new DOMException("Playback request superseded", "AbortError");
export function nativeTransportError(code = "UNAVAILABLE", needsSource = false) {
  const error = new Error("native_transport_unavailable");
  error.nativeTransport = true;
  error.code = code;
  error.needsSource = needsSource;
  return error;
}
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const sameScope = (a, b) => object(a) && object(b) && a.engineId === b.engineId && a.bindingId === b.bindingId;
const validScope = value => object(value) && uuid(value.engineId) && uuid(value.bindingId);
const sameIntent = (a, b) => a.revision === b.revision && a.playWhenReady === b.playWhenReady
  && a.origin === b.origin && a.webRevision === b.webRevision;
const sameResult = (a, b) => a.webRevision === b.webRevision && a.action === b.action && a.phase === b.phase
  && a.decisionIntentRevision === b.decisionIntentRevision && a.reason === b.reason;

function validResult(value, maximum) {
  return object(value) && safe(value.webRevision, true) && value.webRevision <= maximum
    && ["play", "pause"].includes(value.action)
    && ["accepted", "completed", "rejected"].includes(value.phase)
    && (value.decisionIntentRevision === null ? value.phase === "rejected" : safe(value.decisionIntentRevision, true))
    && (value.phase === "rejected" ? resultReasons.has(value.reason) : value.reason === undefined);
}

/** Syntax AND cross-field invariants are checked before a frame changes state. */
function validFrame(value, maximum) {
  const t = value?.transport, s = t?.snapshot, i = s?.intent, o = s?.observed;
  if (!object(value) || !stateEvents.has(value.event) || !validScope(t) || t.version !== 1
    || !safe(t.eventSeq, true) || !object(s) || !object(i) || !object(o)
    || !safe(s.processedWebRevision) || s.processedWebRevision > maximum
    || !safe(s.appliedWebRevision) || s.appliedWebRevision > s.processedWebRevision
    || !safe(i.revision) || typeof i.playWhenReady !== "boolean" || !origins.has(i.origin)
    || typeof o.isPlaying !== "boolean" || typeof o.playWhenReady !== "boolean"
    || !states.has(o.state) || !safe(o.suppressionReason) || !policies.has(o.policyReason)
    || !Number.isFinite(value.position) || value.position < 0 || !Number.isFinite(value.duration) || value.duration < 0
    || value.playing !== o.isPlaying || value.playWhenReady !== o.playWhenReady
    || o.isPlaying && (o.state !== "ready" || !o.playWhenReady || o.suppressionReason !== 0)) return false;
  if (i.origin === "web" ? !safe(i.webRevision, true) || i.webRevision !== s.appliedWebRevision
    : i.webRevision !== null) return false;
  if (i.origin === "baseline" && i.revision !== 0) return false;
  if (i.origin !== "baseline" && i.revision === 0) return false;
  if (t.result !== undefined && (!validResult(t.result, s.processedWebRevision)
    || t.result.decisionIntentRevision !== null && t.result.decisionIntentRevision > i.revision)) return false;
  if (t.requestError !== undefined && (!object(t.requestError) || !safe(t.requestError.webRevision, true)
    || t.requestError.webRevision > maximum || !["play", "pause"].includes(t.requestError.action)
    || !requestReasons.has(t.requestError.reason) || t.result !== undefined)) return false;
  if (t.replyTo !== undefined && !uuid(t.replyTo)) return false;
  if (t.lookup !== undefined) {
    const l = t.lookup;
    if (!uuid(t.replyTo) || !object(l) || !safe(l.webRevision, true) || l.webRevision > maximum) return false;
    if (l.status === "notFound") { if (l.result !== null) return false; }
    else if (!["pending", "terminal"].includes(l.status) || !validResult(l.result, maximum)
      || l.result.webRevision !== l.webRevision
      || l.result.decisionIntentRevision !== null && l.result.decisionIntentRevision > i.revision
      || (l.status === "pending") !== (l.result.phase === "accepted")) return false;
  }
  return true;
}

export function createOrderedAndroidTransport(options) {
  let cache = attachments.get(options.bridge);
  if (!cache) { cache = { mode: "unknown" }; attachments.set(options.bridge, cache); }
  return cache.mode === "legacy" ? null : new OrderedAndroidTransport(options, cache);
}

class OrderedAndroidTransport {
  constructor({ id, send, onUpdate, onFailure, onRecovered, onLegacy, onDecoderError }, cache) {
    Object.assign(this, { id, send, onUpdate, onFailure, onRecovered, onLegacy, onDecoderError, cache });
    this.phase = "idle";
    this.controls = new Map();
    this.pendingReadRevision = null;
    this.records = new Map();
    this.incoming = [];
    this.revision = 0;
    this.sequence = 0;
    this.volumeValue = 0;
    this.loaded = false;
  }
  get supported() { return this.cache.mode === "capable"; }
  get desired() {
    if (this.overlay && (this.overlay.revision == null || !this.latest
      || this.latest.transport.snapshot.processedWebRevision < this.overlay.revision)) return this.overlay.playing;
    return this.latest?.transport.snapshot.intent.playWhenReady ?? false;
  }
  view() {
    const s = this.latest?.transport.snapshot, o = s?.observed;
    const authoritative = !this.overlay || this.overlay.revision != null && s?.processedWebRevision >= this.overlay.revision;
    return { position: this.latest?.position ?? 0, duration: this.latest?.duration ?? 0,
      intent: this.desired, origin: this.overlay ? "web" : s?.intent.origin ?? "baseline",
      ready: this.loaded && o?.state === "ready", ended: o?.state === "ended",
      playing: authoritative && this.desired && o?.isPlaying === true,
      observedPlaying: o?.isPlaying === true,
      paused: !this.desired || o?.state === "ended",
      confirmedPause: authoritative && !this.desired && o?.isPlaying === false && o?.playWhenReady === false,
      phase: this.phase, supported: this.supported };
  }
  start(url, title) {
    this.source = { url, title };
    this.phase = "probing";
    this._hello(false);
  }
  receive(data) {
    if (this.phase === "disposed" || this.phase === "legacy") return;
    if (this.incoming.length >= 64) { this._fail("PROTOCOL_ERROR", false, true); return; }
    this.incoming.push(data);
    if (this.receiving) return;
    this.receiving = true;
    try { while (this.incoming.length) this._receive(this.incoming.shift()); }
    finally { this.receiving = false; }
  }
  _post(message) {
    try { this.send({ id: this.id, ...message }); }
    catch { this._fail("UNAVAILABLE"); }
  }
  _request(action, body = {}, purpose = action, requestId = body.requestId || crypto.randomUUID()) {
    if (this.controls.size >= 32) { this._fail("UNAVAILABLE"); return; }
    const message = { ...body, action, requestId };
    const record = { message, purpose };
    record.timer = setTimeout(() => {
      if (this.controls.get(requestId) !== record || this.phase === "disposed") return;
      this.controls.delete(requestId);
      if (action === "transportHello" && !this.supported) this._legacy();
      else if (["load", "seek", "volume"].includes(action)) this._readState();
      else this._fail("TIMEOUT");
    }, action === "transportHello" ? 1000 : 2000);
    this.controls.set(requestId, record); // Before post: a test/native reply may be synchronous.
    this._post(message);
    return record;
  }
  _take(requestId) {
    const record = this.controls.get(requestId);
    if (record) { clearTimeout(record.timer); this.controls.delete(requestId); }
    return record;
  }
  _hello(recovering) {
    this.recovering = recovering;
    this._request("transportHello");
  }
  _legacy() {
    if (this.phase === "disposed") return;
    if (this.supported) { this._fail("TIMEOUT"); return; }
    this.cache.mode = "legacy";
    this._clearControls();
    this.phase = "legacy";
    const queued = this.queued;
    const api = this.onLegacy();
    if (queued?.playing) Promise.resolve(api.play()).then(queued.resolve, queued.reject);
    else if (queued) api.pause();
    this.queued = null;
  }
  _receive(data) {
    if (this.phase === "disposed" || this.phase === "legacy") return;
    if (!object(data) || data.id !== this.id) return;
    if (data.event === "transportCapabilities") {
      const record = this.controls.get(data.requestId);
      if (record?.message.action !== "transportHello") return;
      this._take(data.requestId);
      this.cache.mode = "capable";
      if (data.version !== 1 || data.capability !== "ordered-transport-v1" || !safe(data.nativeBuildCode, true)
        || !uuid(data.engineId) || !(data.currentBindingId === null || uuid(data.currentBindingId))
        || !uuid(data.bindGrant) || data.grantLifetimeMs !== 5000) {
        this._fail("PROTOCOL_ERROR", false, true); return;
      }
      if (this.recovering) {
        const known = this.scope || (this.bindRequest && { engineId: this.bindRequest.engineId, bindingId: this.bindRequest.bindingId });
        if (!known || data.engineId !== known.engineId) { this._fail("ENGINE_MISMATCH", true); return; }
        if (data.currentBindingId === null) { this._fail("NOT_FOUND", true); return; }
        if (this.bindRequest && data.currentBindingId === this.bindRequest.bindingId) {
          this.phase = "binding";
          this._request("transportBind", this.bindRequest, "bind-replay", this.bindRequest.requestId);
          return;
        }
        if (!this.scope || data.currentBindingId !== this.scope.bindingId) { this._fail("BIND_CONFLICT", true); return; }
      } else if (data.currentBindingId !== null) { this._fail("BIND_CONFLICT", true); return; }
      this.bindRequest = { version: 1, engineId: data.engineId, bindingId: crypto.randomUUID(),
        expectedBindingId: this.recovering ? this.scope.bindingId : null,
        bindGrant: data.bindGrant, requestId: crypto.randomUUID() };
      this.phase = "binding";
      this._request("transportBind", this.bindRequest);
      return;
    }
    if (data.event === "transportControlError") { this._controlError(data); return; }
    if (data.event === "transportControlAck") { this._ack(data); return; }
    if (this.phase === "probing" || this.phase === "idle") return;
    const candidate = this.phase === "binding" ? this.bindRequest : this.scope;
    if (!validScope(data.transport)) { this._fail("PROTOCOL_ERROR", false, true); return; }
    if (!sameScope(data.transport, candidate)) return;
    const maximum = this.phase === "binding" ? 0 : this.revision;
    if (!validFrame(data, maximum)) { this._fail("PROTOCOL_ERROR", false, true); return; }
    if (this.phase === "binding") {
      const record = this.controls.get(data.transport.replyTo);
      if (record?.message.action !== "transportBind") {
        if (!this.buffered || data.transport.eventSeq > this.buffered.transport.eventSeq) this.buffered = data;
        return;
      }
      if (record.purpose !== "bind-replay" && (data.transport.eventSeq !== 1
        || data.transport.snapshot.intent.revision !== 0 || data.transport.snapshot.intent.origin !== "baseline")) {
        this._fail("PROTOCOL_ERROR", false, true); return;
      }
      this._take(data.transport.replyTo);
      this.scope = { engineId: candidate.engineId, bindingId: candidate.bindingId };
      this.restored = Boolean(this.recovering && this.loadSent);
      this.bindRequest = null;
      this.sequence = 0; this.revision = 0; this.records.clear(); this.latest = null;
      this.overlay = this.queued ? { playing: this.queued.playing, revision: null } : null;
      this.phase = "active"; this.blocked = false;
      if (this.buffered?.transport.eventSeq > data.transport.eventSeq) data = this.buffered;
      this.buffered = null;
      this._frame(data);
      if (!this.loadSent) this._load(); else this._flush();
      if (this.recovering && this.phase === "active") {
        this.recovering = false;
        this.onRecovered?.();
        this.recovery?.resolve(); this.recovery = null;
      }
      return;
    }
    if (!this.blocked) this._frame(data);
  }
  _frame(data) {
    const t = data.transport, previous = this.latest?.transport.snapshot;
    if (t.eventSeq > this.sequence) {
      if (previous && (t.snapshot.processedWebRevision < previous.processedWebRevision
        || t.snapshot.appliedWebRevision < previous.appliedWebRevision
        || t.snapshot.intent.revision < previous.intent.revision
        || t.snapshot.intent.revision === previous.intent.revision
          && !sameIntent(t.snapshot.intent, previous.intent))) {
        this._fail("PROTOCOL_ERROR", false, true); return;
      }
      this.latest = data; this.sequence = t.eventSeq;
      if (this.overlay?.revision != null && t.snapshot.processedWebRevision >= this.overlay.revision) this.overlay = null;
      if (t.snapshot.observed.state === "ready") this.loaded = true;
      this.onUpdate(data);
    }
    if (t.result) this._result(t.result, t.eventSeq === this.sequence);
    if (t.requestError) {
      const own = this.records.get(t.requestError.webRevision);
      if (own && own.action === t.requestError.action) {
        if (this.overlay?.revision === t.requestError.webRevision) this.overlay = null;
        this._readState(this.playing?.revision);
      }
    }
    if (t.replyTo) {
      const request = this.controls.get(t.replyTo);
      if (request?.message.action === "transportReadState") {
        this._take(t.replyTo);
        const expected = request.message.forWebRevision;
        if ((expected === undefined) !== (t.lookup === undefined)
          || t.lookup && t.lookup.webRevision !== expected) { this._fail("PROTOCOL_ERROR", false, true); return; }
        if (t.lookup?.result) this._result(t.lookup.result, true);
        else if (t.lookup && this.playing?.revision === expected) {
          if (this._matching(this.playing) && this.latest.transport.snapshot.observed.isPlaying) this._finishPlay();
          else this._fail("OUTCOME_UNKNOWN");
        } else if (t.lookup?.status === "notFound" && expected === this.revision
          && t.snapshot.processedWebRevision < expected) {
          this.overlay = null;
          this._fail("OUTCOME_UNKNOWN");
        }
        if (this.phase === "active") {
          const next = this.pendingReadRevision;
          this.pendingReadRevision = null;
          if (next !== null) this._readState(next);
          this._flush();
        }
      }
    }
    this._supersededPlay();
  }
  _load() {
    if (this.loadSent) { this._readState(); return; }
    this.loadSent = true;
    this._request("load", { ...this.source, transport: { version: 1, ...this.scope } });
    this._flush();
  }
  _ack(data) {
    const own = this.controls.get(data.requestId);
    if (!own || !["load", "seek", "volume", "release"].includes(own.message.action)) return;
    if (data.version !== 1 || data.action !== own.message.action || !sameScope(data.scope, own.message.transport)
      || data.phase !== (["load", "seek"].includes(data.action) ? "accepted" : "completed")) {
      this._fail("PROTOCOL_ERROR", false, true); return;
    }
    this._take(data.requestId);
    if (data.action === "load") { this.loaded = true; this._flush(); }
  }
  _controlError(data) {
    const c = data.correlation;
    if (!object(c)) return;
    const own = c.requestId ? this.controls.get(c.requestId) : this.records.get(c.webRevision);
    const action = own?.message?.action || own?.action;
    if (!own || action !== c.action) return;
    if (!c.requestId && !sameScope(c.attemptedScope, this.scope)) return;
    if (c.attemptedScope !== undefined && (!validScope(c.attemptedScope)
      || c.requestId && !sameScope(c.attemptedScope, own.message.transport || own.message))) return;
    if (data.version !== 1 || !controlReasons.has(data.reason)) {
      this._fail("PROTOCOL_ERROR", false, true); return;
    }
    if (action === "transportHello") this.cache.mode = "capable";
    if (c.requestId) this._take(c.requestId);
    this._fail(data.reason, action === "load" || ["NOT_FOUND", "ENGINE_MISMATCH", "BIND_CONFLICT", "LOAD_CONFLICT"].includes(data.reason));
  }
  _result(result, fresh) {
    const record = this.records.get(result.webRevision);
    if (!record) return;
    if (record.action !== result.action) { this._fail("PROTOCOL_ERROR", false, true); return; }
    const previous = record.result;
    if (previous && previous.phase !== "accepted") {
      if (result.phase === "accepted" && result.decisionIntentRevision === previous.decisionIntentRevision) return;
      if (!sameResult(previous, result)) { this._fail("PROTOCOL_ERROR", false, true); return; }
      if (record !== this.playing) return;
    }
    if (previous && previous.decisionIntentRevision !== result.decisionIntentRevision) {
      this._fail("PROTOCOL_ERROR", false, true); return;
    }
    record.result = result;
    if (result.phase === "accepted") return;
    if (record !== this.playing) {
      clearTimeout(record.timer);
      record.watched = false;
      if (result.phase === "rejected" && result.webRevision === this.revision && result.reason !== "SUPERSEDED") this._fail(result.reason);
      return;
    }
    if (result.phase === "rejected") {
      const snapshot = this.latest.transport.snapshot;
      const superseded = result.decisionIntentRevision !== null
        && snapshot.intent.revision > result.decisionIntentRevision
        && !(snapshot.intent.origin === "policy" && snapshot.observed.policyReason === "timeout");
      if (result.reason === "SUPERSEDED" || superseded) this._finishPlay(abort());
      else if (result.reason === "PLAYER_ERROR") {
        this.onDecoderError?.();
        this._finishPlay(new Error("native_media_failed"));
      }
      else this._fail(result.reason);
    } else if (!this._matching(record)) this._finishPlay(abort());
    else if (fresh || this.latest.transport.snapshot.observed.isPlaying) this._finishPlay();
    else if (!record.confirmed) { record.confirmed = true; this._readState(record.revision); }
  }
  _matching(record) {
    const intent = this.latest?.transport.snapshot.intent;
    return intent?.origin === "web" && intent.webRevision === record.revision && intent.playWhenReady
      && (!record.result?.decisionIntentRevision || intent.revision === record.result.decisionIntentRevision);
  }
  _supersededPlay() {
    const record = this.playing, s = this.latest?.transport.snapshot;
    if (record?.revision && s?.appliedWebRevision >= record.revision && !this._matching(record)
      && !(s.intent.origin === "policy" && s.observed.policyReason === "timeout")) this._finishPlay(abort());
  }
  _readState(revision) {
    if (!this.scope || this.phase !== "active") { this._fail("UNAVAILABLE"); return; }
    if ([...this.controls.values()].some(record => record.message.action === "transportReadState")) {
      // General reads coalesce, but a required result lookup must follow the
      // outstanding read. Keep one latest revision and the original Play timer.
      if (revision != null) this.pendingReadRevision = Math.max(this.pendingReadRevision ?? 0, revision);
      return;
    }
    this._request("transportReadState", { transport: { version: 1, ...this.scope },
      ...(revision == null ? {} : { forWebRevision: revision }) });
  }
  _flush() {
    if (this.phase !== "active" || !this.loadSent) return;
    if (!this.bootstrapOutput) {
      this.bootstrapOutput = true;
      this.volume(this.volumeValue);
      if (this.seekValue != null) { const value = this.seekValue; this.seekValue = null; this.seek(value); }
    }
    if (this.queued) {
      const own = this.queued; this.queued = null;
      this._transport(own);
    }
  }
  _transport(own) {
    if (this.revision === Number.MAX_SAFE_INTEGER) { this._fail("COUNTER_EXHAUSTED"); return; }
    own.revision = ++this.revision;
    own.action = own.playing ? "play" : "pause";
    this.overlay = { playing: own.playing, revision: own.revision };
    if (own.playing) this.playing = own;
    // Old void Pause requests do not keep an unbounded collection of timers.
    for (const previous of this.records.values()) if (previous.action === "pause") {
      clearTimeout(previous.timer); previous.watched = false;
    }
    own.watched = true;
    own.timer = setTimeout(() => {
      if (this.phase !== "active" || !own.watched || this.records.get(own.revision) !== own
        || own.playing && this.playing !== own) return;
      if (own.playing) this._fail("TIMEOUT"); else this._readState(own.revision);
    }, own.playing ? 32_000 : 2_000);
    this.records.set(own.revision, own);
    while (this.records.size > 33) this.records.delete(this.records.keys().next().value);
    if (own.restoreVolume) this.volume(own.volume);
    if (this.phase !== "active") return;
    this._post({ action: own.action, transport: { version: 1, ...this.scope, webRevision: own.revision } });
  }
  play() {
    if (this.phase === "disposed") return Promise.reject(abort());
    if (this.playing) return this.playing.promise;
    if (this.queued?.playing) return this.queued.promise;
    if (this.phase === "active" && !this.overlay && this.desired && this.latest?.transport.snapshot.observed.isPlaying) return Promise.resolve();
    const own = { ...deferred(), playing: true, restoreVolume: this.phase === "error", volume: this.volumeValue };
    this.queued = own; this.overlay = { playing: true, revision: null };
    if (this.phase === "error") this.recover().catch(() => {});
    else this._flush();
    return own.promise;
  }
  pause() {
    if (this.phase === "disposed") return;
    this._finishPlay(abort());
    if (this.queued?.playing) this.queued.reject(abort());
    this.queued = { playing: false };
    this.overlay = { playing: false, revision: null };
    if (this.phase === "error") this.recover().catch(() => {});
    else this._flush();
  }
  volume(value) {
    if (!Number.isFinite(value) || value < 0 || value > 1) return;
    this.volumeValue = value;
    if (this.phase === "active" && this.loadSent) this._request("volume", { value, transport: { version: 1, ...this.scope } });
  }
  seek(value) {
    if (!Number.isFinite(value) || value < 0) return;
    if (this.phase === "active" && this.loadSent) this._request("seek", { value, transport: { version: 1, ...this.scope } });
    else if (!this.loadSent) this.seekValue = value;
  }
  recover() {
    if (this.phase === "disposed") return Promise.reject(abort());
    if (this.recovery) return this.recovery.promise;
    const fresh = this.queued;
    this._finishPlay(abort()); this._clearControls();
    for (const record of this.records.values()) clearTimeout(record.timer);
    this.records.clear(); this.buffered = null;
    this.queued = fresh;
    this.recovery = deferred();
    const promise = this.recovery.promise;
    this.phase = "probing";
    this._hello(true);
    return promise;
  }
  _finishPlay(error) {
    const own = this.playing;
    if (!own) return;
    this.playing = null; clearTimeout(own.timer); own.watched = false;
    if (this.pendingReadRevision === own.revision) this.pendingReadRevision = null;
    if (error) own.reject(error); else own.resolve();
  }
  _clearControls() {
    for (const record of this.controls.values()) clearTimeout(record.timer);
    this.controls.clear();
    this.pendingReadRevision = null;
  }
  _fail(code, needsSource = false, blocked = false) {
    if (this.phase === "disposed" || this.phase === "legacy") return;
    const error = nativeTransportError(code, needsSource);
    this.phase = "error"; this.blocked = blocked;
    this._clearControls();
    for (const record of this.records.values()) clearTimeout(record.timer);
    this._finishPlay(error);
    if (this.queued?.playing) this.queued.reject(error);
    this.queued = null; this.overlay = null;
    this.recovery?.reject(error); this.recovery = null;
    this.onFailure(error);
  }
  dispose() {
    if (this.phase === "disposed") return;
    this._finishPlay(abort());
    if (this.queued?.playing) this.queued.reject(abort());
    this.recovery?.reject(abort()); this.recovery = null;
    this._clearControls();
    for (const record of this.records.values()) clearTimeout(record.timer);
    const scopes = [this.scope, this.bindRequest].filter(validScope);
    this.phase = "disposed";
    this.incoming.length = 0;
    for (const scope of scopes) {
      try { this.send({ id: this.id, action: "release", requestId: crypto.randomUUID(),
        transport: { version: 1, engineId: scope.engineId, bindingId: scope.bindingId } }); } catch { /* Detached. */ }
    }
  }
}
