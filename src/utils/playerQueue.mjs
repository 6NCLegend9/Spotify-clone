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