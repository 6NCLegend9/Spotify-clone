export const CROWD_PROFILE_TTL_MS = 30_000;
export const CROWD_PROFILE_REFRESH_MS = 10_000;

export function crowdTerms(values) {
  return (Array.isArray(values) ? values : []).filter(value => typeof value === "string")
    .map(value => value.trim().replace(/\s+/g, " ").slice(0, 60))
    .filter(value => value.length >= 2).slice(0, 5);
}

// Presence is untrusted transport. Verify each bounded envelope against the key
// obtained from our authenticated endpoint, never a key supplied by a peer.
// Repeated snapshots are allowed: freshness, room scope and account deduplication
// replace the one-shot replay semantics used for playback commands.
export async function verifyCrowdProfiles(envelopes, publicKey, roomId, { now = Date.now(), memberIds, subtle = globalThis.crypto?.subtle } = {}) {
  if (!subtle || !Array.isArray(envelopes) || envelopes.length > 100 || !roomId) return [];
  let key;
  try { key = await subtle.importKey("jwk", publicKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]); }
  catch { return []; }
  const allowed = memberIds ? new Set(memberIds.map(String)) : null;
  const seen = new Map();
  for (const envelope of envelopes) {
    try {
      if (typeof envelope?.message !== "string" || envelope.message.length > 4096
        || typeof envelope.signature !== "string" || !/^[\w-]{86}$/.test(envelope.signature)) continue;
      const data = JSON.parse(envelope.message);
      if (data.event !== "crowd-profile" || data.roomId !== roomId
        || typeof data.senderId !== "string" || !data.senderId || data.senderId.length > 64
        || !Number.isFinite(data.at) || now - data.at > CROWD_PROFILE_TTL_MS || data.at - now > 5000
        || (allowed && !allowed.has(data.senderId))) continue;
      const signature = Uint8Array.from(atob(envelope.signature.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
      if (!await subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, signature, new TextEncoder().encode(envelope.message))) continue;
      if ((seen.get(data.senderId)?.at ?? -Infinity) > data.at) continue;
      seen.set(data.senderId, { id: data.senderId, name: typeof data.payload?.name === "string" ? data.payload.name.slice(0, 60) : "Listener",
        artists: crowdTerms(data.payload?.artists), genres: crowdTerms(data.payload?.genres), at: data.at, envelope });
    } catch { /* Malformed peer data cannot interrupt the rest of the roster. */ }
  }
  return [...seen.values()];
}
