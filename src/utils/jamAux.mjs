export const AUX_SONG_LIMIT = 3;

export function sanitizeAuxState(value) {
  if (!value || typeof value !== "object") return null;
  const holderId = String(value.holderId || "").trim();
  const remaining = Number(value.remaining);
  if (!holderId || !Number.isInteger(remaining) || remaining < 1) return null;
  const holderName = String(value.holderName || "Listener").replace(/\s+/g, " ").trim().slice(0, 64);
  return {
    holderId,
    holderName: holderName || "Listener",
    remaining: Math.min(AUX_SONG_LIMIT, remaining),
  };
}

export function createAuxGrant(member, songs = AUX_SONG_LIMIT) {
  if (!member?.participantId || member.role !== "guest") return null;
  return sanitizeAuxState({
    holderId: member.participantId,
    holderName: member.name,
    remaining: songs,
  });
}

export function consumeAuxSkip(current, participantId) {
  const aux = sanitizeAuxState(current);
  if (!aux || aux.holderId !== participantId) return aux;
  return sanitizeAuxState({ ...aux, remaining: aux.remaining - 1 });
}

export function canControlAux(aux, participantId) {
  const current = sanitizeAuxState(aux);
  return Boolean(current && participantId && current.holderId === participantId);
}
