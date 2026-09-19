export function getHeyKasaDesktopApi() {
  if (typeof window === "undefined") return null;
  const api = window.heykasaDesktop;
  return api && typeof api.getInfo === "function" ? api : null;
}

export function isRunningInHeyKasaDesktop() {
  return Boolean(getHeyKasaDesktopApi());
}

function desktopPolicy(value) {
  if (!value || typeof value !== "object") return null;
  const features = value.features && typeof value.features === "object" ? value.features : {};
  return {
    maintenance: value.maintenance === true,
    maintenanceMessage: typeof value.maintenanceMessage === "string"
      ? value.maintenanceMessage.slice(0, 240)
      : "",
    features: {
      auth: features.auth !== false,
      discord: features.discord !== false,
      updater: features.updater !== false,
    },
    updatedAt: Number.isFinite(value.updatedAt) ? value.updatedAt : 0,
  };
}

export async function getHeyKasaDesktopInfo() {
  const api = getHeyKasaDesktopApi();
  if (!api) return null;
  try {
    const info = await api.getInfo();
    if (!info || typeof info !== "object") return null;
    return {
      productName: typeof info.productName === "string" ? info.productName : "HayKasa",
      desktopVersion: typeof info.desktopVersion === "string" ? info.desktopVersion : "",
      apiVersion: Number.isInteger(info.apiVersion) ? info.apiVersion : 0,
      capabilities: Array.isArray(info.capabilities)
        ? info.capabilities.filter((value) => typeof value === "string")
        : [],
      platform: typeof info.platform === "string" ? info.platform : "",
      arch: typeof info.arch === "string" ? info.arch : "",
      packaged: info.packaged === true,
      safeMode: info.safeMode === true,
      policy: desktopPolicy(info.policy),
    };
  } catch {
    return null;
  }
}

export function hasDesktopCapability(info, capability) {
  return Boolean(info?.capabilities?.includes(capability));
}
