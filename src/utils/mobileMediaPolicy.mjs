const MOBILE_AGENT = /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i;
const DESKTOP_SHELL = /Electron\//i;

// Device routing is a playback preference, not an authorization boundary.
export function isMobileMediaClient(client = {}, desktopShell = false) {
  const agent = typeof client?.userAgent === "string" ? client.userAgent : "";
  if (desktopShell || DESKTOP_SHELL.test(agent)) return false;
  return client?.userAgentData?.mobile === true || MOBILE_AGENT.test(agent)
    || (/Macintosh/i.test(agent) && Number(client?.maxTouchPoints) > 1);
}

export function mobileMediaHeaders(client, desktopShell = false) {
  return isMobileMediaClient(client, desktopShell) ? { "X-HayKasa-Media-Client": "mobile" } : {};
}

export function isMobileMediaRequest(headers) {
  const agent = headers?.get("user-agent") || "";
  if (DESKTOP_SHELL.test(agent)) return false;
  return MOBILE_AGENT.test(agent) || headers?.get("sec-ch-ua-mobile") === "?1"
    || (headers?.get("x-haykasa-media-client") === "mobile" && /Macintosh/i.test(agent));
}
