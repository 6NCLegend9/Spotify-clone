import {
  LOCAL_APP_ORIGINS,
  PRODUCTION_SITE_URL,
  isLocalAppOrigin,
  normalizeAppOrigin,
} from "./appOrigin.mjs";

function configuredLocalOrigins(env) {
  return [env.NEXTAUTH_URL, env.NEXT_PUBLIC_APP_URL]
    .map((value) => normalizeAppOrigin(value, { allowLocalHttp: true }))
    .filter((origin) => origin && isLocalAppOrigin(origin));
}

export function trustedAppOrigins(env = process.env) {
  if (env.NODE_ENV === "production") {
    return new Set([PRODUCTION_SITE_URL]);
  }

  return new Set([
    ...LOCAL_APP_ORIGINS,
    ...configuredLocalOrigins(env),
  ]);
}

export function isTrustedRequestOrigin(request, env = process.env) {
  const origin = normalizeAppOrigin(request?.headers?.get?.("origin"), {
    allowLocalHttp: env.NODE_ENV !== "production",
  });
  return Boolean(origin && trustedAppOrigins(env).has(origin));
}

export function resolveAuthBaseUrl(baseUrl, env = process.env) {
  if (env.NODE_ENV === "production") return PRODUCTION_SITE_URL;

  const requestedBase = normalizeAppOrigin(baseUrl, { allowLocalHttp: true });
  if (requestedBase && trustedAppOrigins(env).has(requestedBase)) {
    return requestedBase;
  }

  return configuredLocalOrigins(env)[0] || LOCAL_APP_ORIGINS.values().next().value;
}
