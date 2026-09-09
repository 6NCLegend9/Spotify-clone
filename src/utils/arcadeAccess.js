// Optional allow-list for the Beat Arcade preview.
// NEXT_PUBLIC_ARCADE_ALLOWED_EMAILS=comma,separated,emails
// Empty (default) = arcade is open to everyone.
const ALLOWED_EMAILS = (process.env.NEXT_PUBLIC_ARCADE_ALLOWED_EMAILS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export function canUseArcade(email) {
  if (ALLOWED_EMAILS.length === 0) return true;
  if (typeof email !== "string") return false;
  return ALLOWED_EMAILS.includes(email.trim().toLowerCase());
}
