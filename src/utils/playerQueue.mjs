export function queueEntryIdentity(track) {
  if (!track) return null;
  return track.queueEntryId || track.id || null;
}

export function queueOccurrenceMatches(track, token) {
  if (!track || !token) return false;
  if (token.queueEntryId && track.queueEntryId) {
    return token.queueEntryId === track.queueEntryId;
  }
  return Boolean(token.id) && token.id === track.id;
}

export function resolveQueueStartIndex(queue, track, requestedIndex) {
  const list = Array.isArray(queue) ? queue : [];
  if (!track?.id) return -1;

  if (
    Number.isInteger(requestedIndex)
    && requestedIndex >= 0
    && requestedIndex < list.length
    && list[requestedIndex]?.id === track.id
  ) {
    return requestedIndex;
  }

  const byReference = list.indexOf(track);
  if (byReference >= 0) return byReference;

  if (track.queueEntryId) {
    const identity = queueEntryIdentity(track);
    const byOccurrence = list.findIndex((item) => queueEntryIdentity(item) === identity);
    if (byOccurrence >= 0) return byOccurrence;
  }

  return list.findIndex((item) => item?.id === track.id);
}

export function queueTrackIndex(queue, current) {
  const identity = typeof current === "object" ? queueEntryIdentity(current) : current;
  if (!identity) return -1;
  return (Array.isArray(queue) ? queue : []).findIndex((track) => matchesTrack(track, identity));
}

export function queueWithoutCurrentOccurrence(queue, current) {
  const identity = queueEntryIdentity(current);
  if (!identity) return Array.isArray(queue) ? [...queue] : [];
  let removed = false;
  return (Array.isArray(queue) ? queue : []).filter((track) => {
    if (removed || queueEntryIdentity(track) !== identity) return true;
    removed = true;
    return false;
  });
}

export function restoreQueueOccurrenceState(queue, current) {
  const source = (Array.isArray(queue) ? queue : []).filter(Boolean);
  const nextQueue = current?.id && queueTrackIndex(source, current) < 0
    ? [current, ...source]
    : source;
  const userQueue = queueWithoutCurrentOccurrence(nextQueue, current)
    .filter((track) => track?.queueSource === "user");
  return { queue: nextQueue, userQueue };
}

export function queueAdvanceDecision(current, next, { avoidId = null } = {}) {
  if (!next?.id) return "none";
  if (avoidId && next.id === avoidId) return "blocked";
  return queueEntryIdentity(current) === queueEntryIdentity(next) ? "replay" : "advance";
}

function matchesTrack(track, identity) {
  if (!track || !identity) return false;
  if (track.queueEntryId && track.queueEntryId === identity) return true;
  return track.id === identity;
}

export function restoreQueueOrder(queue, originalIdentities) {
  const source = Array.isArray(queue) ? queue : [];
  const order = new Map(
    (Array.isArray(originalIdentities) ? originalIdentities : [])
      .filter(Boolean)
      .map((identity, index) => [identity, index]),
  );
  return source
    .map((track, index) => ({
      track,
      index,
      rank: order.has(queueEntryIdentity(track))
        ? order.get(queueEntryIdentity(track))
        : Number.POSITIVE_INFINITY,
    }))
    .sort((first, second) => first.rank - second.rank || first.index - second.index)
    .map(({ track }) => track);
}

export function shuffleUpcoming(queue, currentIdentity, random = Math.random) {
  const index = queueTrackIndex(queue, currentIdentity);
  const boundary = index < 0 ? 0 : index + 1;
  const upcoming = queue.slice(boundary);
  for (let cursor = upcoming.length - 1; cursor > 0; cursor -= 1) {
    const target = Math.min(cursor, Math.max(0, Math.floor(random() * (cursor + 1))));
    [upcoming[cursor], upcoming[target]] = [upcoming[target], upcoming[cursor]];
  }
  return [...queue.slice(0, boundary), ...upcoming];
}

export function nextQueueTrack(
  queue,
  currentIdentity,
  repeat = false,
  { avoidId = null } = {},
) {
  const index = queueTrackIndex(queue, currentIdentity);
  if (index < 0) return null;
  const allowed = (track) => track?.id && (!avoidId || track.id !== avoidId);
  return queue.slice(index + 1).find(allowed)
    || (repeat ? queue.find(allowed) : null) || null;
}

export function editUpcomingQueue(queue, currentIdentity, { kind, id, entryId, index: requestedIndex, direction, toIndex }) {
  const currentIndex = queueTrackIndex(queue, currentIdentity);
  const boundary = currentIndex < 0 ? 0 : currentIndex + 1;
  if (kind === "clear") return queue.length > boundary ? queue.slice(0, boundary) : queue;

  // Prefer a concrete row index or occurrence id so duplicate tracks can be edited independently.
  const index = Number.isInteger(requestedIndex)
    ? requestedIndex
    : queue.findIndex((track, position) => position >= boundary
      && (entryId ? track.queueEntryId === entryId : track.id === id));
  if (index < boundary || index < 0 || index >= queue.length) return queue;

  if (kind === "remove") {
    const next = [...queue];
    next.splice(index, 1);
    return next;
  }

  if (kind === "reorder") {
    if (!Number.isInteger(toIndex)) return queue;
    const target = Math.min(queue.length - 1, Math.max(boundary, toIndex));
    if (target === index) return queue;
    const next = [...queue];
    const [track] = next.splice(index, 1);
    next.splice(target, 0, track);
    return next;
  }

  const target = index + direction;
  if (kind !== "move" || ![-1, 1].includes(direction) || target < boundary || target >= queue.length) return queue;
  const next = [...queue];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
