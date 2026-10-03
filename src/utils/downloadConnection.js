export function checkWifiDownloadConnection() {
  if (typeof navigator === "undefined") {
    return { status: "unknown" };
  }

  const connection =
    navigator.connection ||
    navigator.mozConnection ||
    navigator.webkitConnection;
  const type =
    typeof connection?.type === "string"
      ? connection.type.toLowerCase()
      : "";

  if (!type || type === "unknown") {
    return { status: "unknown" };
  }

  return { status: type === "wifi" ? "wifi" : "non-wifi", type };
}


export function evaluateWifiOnlyDownload(
  wifiOnlyDownloads,
  connection = checkWifiDownloadConnection(),
) {
  if (!wifiOnlyDownloads) {
    return { allowed: true, reason: "disabled", message: "" };
  }

  if (connection?.status === "wifi") {
    return { allowed: true, reason: "wifi", message: "" };
  }

  if (connection?.status === "non-wifi") {
    return {
      allowed: false,
      reason: "non-wifi",
      message: "Wi-Fi-only downloads are enabled. Connect to Wi-Fi or turn off this setting to download.",
    };
  }

  return {
    allowed: false,
    reason: "unknown",
    message: "This browser can’t verify whether you’re on Wi-Fi. To keep Wi-Fi-only downloads strict, this download was blocked. Turn off Wi-Fi-only downloads to continue.",
  };
}
