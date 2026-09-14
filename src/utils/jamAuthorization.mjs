const hostEvents = new Set(["sync", "join-accept", "ended"]);
const memberEvents = new Set(["heartbeat", "member-left", "enqueue", "join-request", "sync-request"]);
export function jamEventRole(room, userId, event, now = Date.now()) {
  if (!room || room.closed || new Date(room.expiresAt).getTime() <= now) return null;
  const role = String(room.hostId) === userId ? "host" : room.members?.includes(userId) ? "guest" : null;
  if (!role || (!hostEvents.has(event) && !memberEvents.has(event))) return null;
  return hostEvents.has(event) && role !== "host" ? null : role;
}
