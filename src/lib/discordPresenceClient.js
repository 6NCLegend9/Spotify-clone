import DiscordBridgeClient from "@/lib/discordBridgeClient";

function desktopShellApi() {
  if (typeof window === "undefined") return null;
  const desktop = window.heykasaDesktop;
  return desktop && typeof desktop.getInfo === "function" ? desktop : null;
}

function nativeDiscordApi() {
  const desktop = desktopShellApi();
  const discord = desktop?.discord;
  if (!discord || typeof discord.setActivity !== "function" || typeof discord.clearActivity !== "function") {
    return null;
  }
  return discord;
}

class DesktopDiscordClient {
  constructor(api) {
    this.api = api;
    this._connected = false;
  }

  get connected() {
    return this._connected;
  }

  async setActivity(activity) {
    const result = activity
      ? await this.api.setActivity(activity)
      : await this.api.clearActivity();
    this._connected = result?.connected === true || (Boolean(activity) && result?.connected !== false);
    return result;
  }

  disconnect() {
    this._connected = false;
    if (typeof this.api.disconnect === "function") {
      void this.api.disconnect().catch(() => {});
    } else {
      void this.api.clearActivity().catch(() => {});
    }
  }
}

class UnsupportedDesktopDiscordClient {
  get connected() {
    return false;
  }

  async setActivity() {
    throw new Error("This HeyKasa Desktop version does not support native Discord presence. Update the desktop app first.");
  }

  disconnect() {}
}

export function isHeyKasaDesktop() {
  return Boolean(desktopShellApi());
}

export function createDiscordPresenceClient() {
  const nativeApi = nativeDiscordApi();
  if (nativeApi) return new DesktopDiscordClient(nativeApi);
  if (desktopShellApi()) return new UnsupportedDesktopDiscordClient();
  return new DiscordBridgeClient();
}
