export function shouldOfferOneMore({ armed, completed, radio, jamGuest } = {}) {
  return Boolean(armed && completed && radio && !jamGuest);
}

export function pickOneMoreTrack(candidates, { currentId, queuedIds } = {}) {
  const blocked = new Set([currentId, ...(Array.isArray(queuedIds) ? queuedIds : [])].filter(Boolean));
  return (Array.isArray(candidates) ? candidates : []).find((item) => item?.id && !blocked.has(item.id)) || null;
}
