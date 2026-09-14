export function shuffleUpcoming(queue, currentId, random = Math.random) {
  const index = queue.findIndex((track) => track.id === currentId);
  const boundary = index < 0 ? 0 : index + 1;
  const upcoming = queue.slice(boundary);
  for (let cursor = upcoming.length - 1; cursor > 0; cursor -= 1) {
    const target = Math.min(cursor, Math.max(0, Math.floor(random() * (cursor + 1))));
    [upcoming[cursor], upcoming[target]] = [upcoming[target], upcoming[cursor]];
  }
  return [...queue.slice(0, boundary), ...upcoming];
}

export function nextQueueTrack(queue, currentId, repeat = false) {
  const index = queue.findIndex((track) => track?.id === currentId);
  if (index < 0) return null;
  return queue.slice(index + 1).find((track) => track?.id)
    || (repeat ? queue.find((track) => track?.id) : null) || null;
}

export function editUpcomingQueue(queue, currentId, { kind, id, index: requestedIndex, direction, toIndex }) {
  const currentIndex = queue.findIndex((track) => track.id === currentId);
  const boundary = currentIndex < 0 ? 0 : currentIndex + 1;
  if (kind === "clear") return queue.length > boundary ? queue.slice(0, boundary) : queue;

  // Prefer a concrete row index so duplicate tracks can be edited independently.
  const index = Number.isInteger(requestedIndex)
    ? requestedIndex
    : queue.findIndex((track, position) => position >= boundary && track.id === id);
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
