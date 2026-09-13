import dns from "node:dns";
import { Resolver } from "node:dns/promises";

const FALLBACK_DNS_SERVERS = ["8.8.8.8", "1.1.1.1"];

export function mongoSrvDnsServers(currentServers = dns.getServers()) {
  const usable = currentServers.filter((server) => {
    const host = String(server).replace(/^\[|\]$/g, "").split("%")[0];
    return host !== "127.0.0.1" && host !== "::1" && host !== "0.0.0.0";
  });
  return [...new Set([...FALLBACK_DNS_SERVERS, ...usable])];
}

export function buildStandardMongoUrl({
  username = "",
  password = "",
  hosts,
  pathname = "/",
  search = "",
  txt = "",
}) {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  new URLSearchParams(txt).forEach((value, key) => {
    if (!params.has(key)) params.set(key, value);
  });
  if (!params.has("tls") && !params.has("ssl")) params.set("tls", "true");

  const auth = username
    ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
    : "";
  const dbPath = pathname && pathname !== "/" ? pathname : "/";
  const query = params.toString();
  return `mongodb://${auth}${hosts}${dbPath}${query ? `?${query}` : ""}`;
}

async function resolveSrvRecords(hostname) {
  const resolver = new Resolver();
  resolver.setServers(mongoSrvDnsServers());
  const srvRecords = await resolver.resolveSrv(`_mongodb._tcp.${hostname}`);
  let txt = "";
  try {
    const txtRecords = await resolver.resolveTxt(hostname);
    txt = txtRecords.flat().join("&");
  } catch {
    txt = "";
  }
  return { srvRecords, txt };
}

const resolvedUrlCache = globalThis.__HeyKasaMongoResolved || { source: "", resolved: "" };
globalThis.__HeyKasaMongoResolved = resolvedUrlCache;

export async function resolveMongoConnectionUrl(mongoUrl) {
  if (resolvedUrlCache.source === mongoUrl && resolvedUrlCache.resolved) {
    return resolvedUrlCache.resolved;
  }

  let parsed;
  try {
    parsed = new URL(mongoUrl);
  } catch {
    return mongoUrl;
  }
  if (parsed.protocol !== "mongodb+srv:") {
    resolvedUrlCache.source = mongoUrl;
    resolvedUrlCache.resolved = mongoUrl;
    return mongoUrl;
  }

  const { srvRecords, txt } = await resolveSrvRecords(parsed.hostname);
  if (!Array.isArray(srvRecords) || srvRecords.length === 0) {
    throw new Error("Could not resolve MongoDB cluster hosts.");
  }

  const hosts = srvRecords
    .slice()
    .sort((a, b) => a.priority - b.priority || b.weight - a.weight)
    .map((record) => `${record.name}:${record.port || 27017}`)
    .join(",");

  const resolved = buildStandardMongoUrl({
    username: parsed.username,
    password: parsed.password,
    hosts,
    pathname: parsed.pathname,
    search: parsed.search,
    txt,
  });
  resolvedUrlCache.source = mongoUrl;
  resolvedUrlCache.resolved = resolved;
  return resolved;
}
