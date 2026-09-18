export const dynamic = "force-dynamic";

function enabled(name, fallback = true) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["0", "false", "off", "disabled"].includes(raw)) return false;
  if (["1", "true", "on", "enabled"].includes(raw)) return true;
  return fallback;
}

function percentage(name, fallback = 100) {
  const raw = String(process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : fallback;
}

function maintenanceMessage() {
  const value = String(process.env.HEYKASA_DESKTOP_MAINTENANCE_MESSAGE || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return value.slice(0, 240);
}

export async function GET() {
  const features = {
    auth: enabled("HEYKASA_DESKTOP_AUTH_ENABLED"),
    discord: enabled("HEYKASA_DESKTOP_DISCORD_ENABLED"),
    updater: enabled("HEYKASA_DESKTOP_UPDATER_ENABLED"),
  };
  const maintenance = enabled("HEYKASA_DESKTOP_ENABLED", true) === false;

  return Response.json({
    formatVersion: 1,
    maintenance,
    maintenanceMessage: maintenance ? maintenanceMessage() : "",
    updateRolloutPercent: percentage("HEYKASA_DESKTOP_UPDATE_ROLLOUT_PERCENT", 100),
    features,
  }, {
    headers: {
      "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=120",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
