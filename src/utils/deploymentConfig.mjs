export function validateDeploymentConfig(env) {
  const errors = [];
  const warnings = [];
  const value = (key) => typeof env[key] === "string" ? env[key].trim() : "";
  const origin = (key) => {
    try {
      const url = new URL(value(key));
      if (url.protocol !== "https:" || url.username || url.password
        || url.pathname !== "/" || url.search || url.hash) throw new Error();
      return url.origin;
    } catch {
      errors.push(`${key} must be a canonical HTTPS origin.`);
      return null;
    }
  };
  const authOrigin = origin("NEXTAUTH_URL");
  const appOrigin = origin("NEXT_PUBLIC_APP_URL");
  if (authOrigin && appOrigin && authOrigin !== appOrigin) errors.push("NEXTAUTH_URL and NEXT_PUBLIC_APP_URL must match.");
  if ((value("JWT_SECRET") || value("NEXTAUTH_SECRET")).length < 32) errors.push("JWT_SECRET or NEXTAUTH_SECRET must contain at least 32 characters.");
  if (value("RATE_LIMIT_SECRET").length < 32) errors.push("RATE_LIMIT_SECRET must contain at least 32 characters.");
  if (!/^mongodb(?:\+srv)?:\/\//.test(value("MONGODB_URL") || value("MONGODB_URI"))) errors.push("MONGODB_URL or MONGODB_URI must be configured with a MongoDB URI.");
  for (const key of ["MAIL_HOST", "MAIL_USER", "MAIL_PASS"]) {
    if (!value(key)) errors.push(`${key} is required for account email delivery.`);
  }
  const port = Number(value("MAIL_PORT") || 465);
  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push("MAIL_PORT must be an integer from 1 to 65535.");
  if (value("MAIL_SECURE") && !["true", "false"].includes(value("MAIL_SECURE"))) errors.push("MAIL_SECURE must be true or false.");
  for (const [name, keys] of [
    ["Google sign-in", ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]],
    ["Jam", ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]],
  ]) {
    const count = keys.filter((key) => value(key)).length;
    if (count === 1) errors.push(`${name} requires both ${keys.join(" and ")}.`);
    if (count === 0) warnings.push(`${name} is not configured.`);
  }
  if (value("NEXT_PUBLIC_SUPABASE_URL")) origin("NEXT_PUBLIC_SUPABASE_URL");
  if (!value("YOUTUBE_API_KEY")) warnings.push("Official YouTube Data API access is not configured; fallback availability is provider-dependent.");
  return { errors, warnings };
}