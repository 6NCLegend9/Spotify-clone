export async function jamEnvelopeVerifier(publicKey, roomId, subtle = globalThis.crypto.subtle) {
  const key = await subtle.importKey("jwk", publicKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const seen = new Map();
  const latest = new Map();
  return async (envelope, event) => {
    try {
      if (typeof envelope?.message !== "string" || envelope.message.length > 66_000 || typeof envelope.signature !== "string" || envelope.signature.length > 100) return null;
      const data = JSON.parse(envelope.message);
      const now = Date.now();
      if (data.roomId !== roomId || data.event !== event || !Number.isFinite(data.at) || Math.abs(now - data.at) > 30_000 || !data.id || seen.has(data.id)) return null;
      const bytes = Uint8Array.from(atob(envelope.signature.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0));
      if (!await subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, bytes, new TextEncoder().encode(envelope.message))) return null;
      // Recheck after await: concurrent deliveries must not both apply.
      if (seen.has(data.id)) return null;
      const stream = `${data.senderId}:${event}`;
      if (data.at < (latest.get(stream) || 0)) return null;
      for (const [id, at] of seen) if (now - at > 30_000) seen.delete(id);
      for (const [id, at] of latest) if (now - at > 30_000) latest.delete(id);
      if (seen.size >= 2000) return null;
      seen.set(data.id, data.at);
      latest.set(stream, data.at);
      return data;
    } catch { return null; }
  };
}

export async function signedJamChannel(raw, grant) {
  const verify = await jamEnvelopeVerifier(grant.publicKey, grant.roomId);
  const members = new Map();
  const presenceHandlers = [];
  const wrapper = {
    __raw: raw,
    presenceState() { return Object.fromEntries([...members].filter(([, item]) => Date.now() - item.seenAt < 30_000).map(([id, item]) => [id, [item.payload]])); },
    track() { return Promise.resolve("ok"); },
    on(type, filter, handler) {
      if (type === "presence") { presenceHandlers.push(handler); return wrapper; }
      raw.on(type, filter, async ({ payload }) => {
        const data = await verify(payload, filter.event);
        if (!data) return;
        if (["heartbeat", "join-request", "join-accept"].includes(data.event)) members.set(data.senderId, { payload: data.payload, seenAt: Date.now() });
        if (data.event === "member-left" || data.event === "ended") members.delete(data.senderId);
        handler({ payload: data.payload });
        if (["heartbeat", "join-request", "join-accept", "member-left"].includes(data.event)) presenceHandlers.forEach((callback) => callback());
      });
      return wrapper;
    },
    subscribe(callback) { raw.subscribe(callback); return wrapper; },
    async send({ event, payload }) {
      try {
        const response = await fetch("/api/jam/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ roomId: grant.roomId, event, payload }) });
        const json = await response.json();
        if (!response.ok || !json.data?.message) return "error";
        const signedEvent = JSON.parse(json.data.message).event;
        return await raw.send({ type: "broadcast", event: signedEvent, payload: json.data });
      } catch { return "error"; }
    },
  };
  return wrapper;
}
