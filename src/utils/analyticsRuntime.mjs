const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function isAnalyticsRuntimeEnabled({
  nodeEnv = process.env.NODE_ENV,
  hostname = "",
} = {}) {
  if (nodeEnv !== "production") return false;
  return Boolean(hostname) && !LOCAL_HOSTNAMES.has(hostname);
}
