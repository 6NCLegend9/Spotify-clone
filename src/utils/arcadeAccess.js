// Temporary allow-list while the arcade is in preview. Set
// NEXT_PUBLIC_ARCADE_ALLOWED_EMAILS (comma separated) to grant access; with no
// value nobody can reach the arcade, which keeps the preview closed by default.
const ALLOWED_EMAILS = (process.env.NEXT_PUBLIC_ARCADE_ALLOWED_EMAILS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export function canUseArcade(email) {
  if (typeof email !== "string") return false;
  return ALLOWED_EMAILS.includes(email.trim().toLowerCase());
}
