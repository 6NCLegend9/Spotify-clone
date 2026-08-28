const baseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

export function resolveApiUrl(path) {
  if (typeof path !== "string" || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(path)) return path;
  return `${baseUrl}${path}`;
}

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export function withQuery(path, query = {}) {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") parameters.set(key, String(value));
  }
  const search = parameters.toString();
  return search ? `${path}?${search}` : path;
}

export async function request(path, options = {}) {
  const { body, headers, ...requestOptions } = options;
  const response = await fetch(resolveApiUrl(path), {
    credentials: "include",
    ...requestOptions,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const contentType = response.headers.get("content-type") || "";
  const payload = response.status === 204 ? null : contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok) throw new ApiError(payload?.message || "The request could not be completed", response.status, payload);
  return payload;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body }),
  patch: (path, body) => request(path, { method: "PATCH", body }),
  delete: (path) => request(path, { method: "DELETE" }),
};