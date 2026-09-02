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
