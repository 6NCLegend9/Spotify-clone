export function getHeyKasaDesktopApi() {
  if (typeof window === "undefined") return null;
  const api = window.heykasaDesktop;
  return api && typeof api.getInfo === "function" ? api : null;
}

export function isRunningInHeyKasaDesktop() {
  return Boolean(getHeyKasaDesktopApi());
}

export async function getHeyKasaDesktopInfo() {
  const api = getHeyKasaDesktopApi();
  if (!api) return null;
  try {
    const info = await api.getInfo();
    if (!info || typeof info !== "object") return null;
    return {
      productName: typeof info.productName === "string" ? info.productName : "HeyKasa",
      desktopVersion: typeof info.desktopVersion === "string" ? info.desktopVersion : "",
      apiVersion: Number.isInteger(info.apiVersion) ? info.apiVersion : 0,
      capabilities: Array.isArray(info.capabilities)
        ? info.capabilities.filter((value) => typeof value === "string")
        : [],
      platform: typeof info.platform === "string" ? info.platform : "",
      arch: typeof info.arch === "string" ? info.arch : "",
      packaged: info.packaged === true,
    };
  } catch {
    return null;
  }
}

export function hasDesktopCapability(info, capability) {
  return Boolean(info?.capabilities?.includes(capability));
}
