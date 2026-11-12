import assert from "node:assert/strict";
import test from "node:test";
import { signedJamChannel } from "../src/utils/jamSignedChannel.mjs";

// Exercise the production adapter and real ECDSA verification. Only HTTP and
// realtime delivery are controlled; these checks do not qualify deployed RLS.
const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const grant = { publicKey: await crypto.subtle.exportKey("jwk", keys.publicKey), roomId: "room-a" };
async function envelope(event = "heartbeat") {
  const message = JSON.stringify({ roomId: grant.roomId, event, senderId: "host", id: crypto.randomUUID(), at: Date.now(), payload: { name: "Host" } });
  const signature = Buffer.from(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, new TextEncoder().encode(message))).toString("base64url");
  return { message, signature };
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
async function fixture(t) {
  const deliveries = new Map(), sent = [], states = [], received = [];
  let subscription;
  const raw = {
    on(type, filter, handler) { deliveries.set(filter.event, handler); return raw; },
    subscribe(callback) { subscription = callback; return raw; },
    async send(value) { sent.push(value); return "ok"; },
  };
  const channel = await signedJamChannel(raw, grant);
  channel.on("broadcast", { event: "heartbeat" }, (value) => received.push(value)).subscribe((state) => states.push(state));
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  return { channel, sent, states, received, deliver: (payload) => deliveries.get("heartbeat")({ payload }), state: (value) => subscription(value) };
}
const send = (channel, event = "heartbeat") => channel.send({ event, payload: {} });

for (const status of [401, 403]) {
  test(`heartbeat ${status} retires the channel even with a non-JSON error body`, async (t) => {
    const f = await fixture(t);
    await f.deliver(await envelope());
    assert.equal(Object.keys(f.channel.presenceState()).length, 1);
    let requests = 0;
    globalThis.fetch = async () => { requests++; return new Response("Denied", { status }); };
    assert.equal(await send(f.channel), "error");
    assert.deepEqual(f.states, ["ACCESS_DENIED"]);
    assert.deepEqual(f.channel.presenceState(), {});
    await f.deliver(await envelope());
    f.state("SUBSCRIBED");
    assert.equal(f.received.length, 1);
    assert.deepEqual(f.states, ["ACCESS_DENIED"]);
    assert.equal(await send(f.channel), "error");
    assert.equal(await f.channel.track({}), "error");
    assert.equal(requests, 1);
  });
}

test("action-specific 403, 429, 503 and network failure do not revoke membership", async (t) => {
  const f = await fixture(t);
  for (const [status, event] of [[403, "sync"], [429, "heartbeat"], [503, "heartbeat"]]) {
    globalThis.fetch = async () => new Response("{}", { status });
    assert.equal(await send(f.channel, event), "error");
  }
  globalThis.fetch = async () => { throw new Error("offline"); };
  assert.equal(await send(f.channel), "error");
  assert.deepEqual(f.states, []);
  const signed = await envelope();
  globalThis.fetch = async () => Response.json({ data: signed });
  assert.equal(await send(f.channel), "ok");
  await f.deliver(signed);
  assert.equal(f.received.length, 1);
});

test("401 on any event retires an expired authenticated session", async (t) => {
  const f = await fixture(t);
  globalThis.fetch = async () => new Response("{}", { status: 401 });
  await send(f.channel, "enqueue");
  assert.deepEqual(f.states, ["ACCESS_DENIED"]);
});

test("revocation blocks an older successful HTTP response and notifies once", async (t) => {
  const f = await fixture(t), pending = deferred(), signed = await envelope();
  globalThis.fetch = () => pending.promise;
  const oldSend = send(f.channel);
  globalThis.fetch = async () => new Response("{}", { status: 403 });
  await Promise.all([send(f.channel), send(f.channel)]);
  pending.resolve(Response.json({ data: signed }));
  assert.equal(await oldSend, "error");
  assert.equal(f.sent.length, 0);
  assert.deepEqual(f.states, ["ACCESS_DENIED"]);
});

test("revocation blocks delivery already awaiting signature verification", async (t) => {
  const f = await fixture(t), signed = await envelope();
  globalThis.fetch = async () => new Response("{}", { status: 403 });
  const denial = send(f.channel);
  const delivery = f.deliver(signed);
  await Promise.all([denial, delivery]);
  assert.equal(f.received.length, 0);
  assert.deepEqual(f.channel.presenceState(), {});
});

test("local close blocks late HTTP, events and subscription callbacks without revocation", async (t) => {
  const f = await fixture(t), pending = deferred(), signed = await envelope();
  globalThis.fetch = () => pending.promise;
  const sending = send(f.channel);
  f.channel.close();
  pending.resolve(Response.json({ data: signed }));
  assert.equal(await sending, "error");
  await f.deliver(signed);
  f.state("SUBSCRIBED");
  assert.deepEqual(f.states, []);
  assert.equal(f.sent.length, 0);
  assert.equal(f.received.length, 0);
});

test("close during response body decoding prevents publishing the signed event", async (t) => {
  const f = await fixture(t), body = deferred(), decoding = deferred(), signed = await envelope();
  globalThis.fetch = async () => ({ status: 200, ok: true, json() { decoding.resolve(); return body.promise; } });
  const sending = send(f.channel);
  await decoding.promise;
  f.channel.close();
  body.resolve({ data: signed });
  assert.equal(await sending, "error");
  assert.equal(f.sent.length, 0);
});

test("an old denial after local close does not emit a fresh access-loss notification", async (t) => {
  const f = await fixture(t), pending = deferred();
  globalThis.fetch = () => pending.promise;
  const sending = send(f.channel);
  f.channel.close();
  pending.resolve(new Response("Denied", { status: 401 }));
  assert.equal(await sending, "error");
  assert.deepEqual(f.states, []);
});
