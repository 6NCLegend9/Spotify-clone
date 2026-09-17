import DiscordBridgeClient from "@/lib/discordBridgeClient";

function nativeDiscordApi() {
  if (typeof window === "undefined") return null;
  const desktop = window.heykasaDesktop;
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

export function isHeyKasaDesktop() {
  return Boolean(nativeDiscordApi());
}

export function createDiscordPresenceClient() {
  const nativeApi = nativeDiscordApi();
  return nativeApi ? new DesktopDiscordClient(nativeApi) : new DiscordBridgeClient();
}
