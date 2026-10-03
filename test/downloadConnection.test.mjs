import assert from "node:assert/strict";
import test from "node:test";
import * as downloadConnection from "../src/utils/downloadConnection.js";

test("Wi-Fi-only downloads fail closed when the browser cannot verify network type", () => {
  assert.equal(typeof downloadConnection.evaluateWifiOnlyDownload, "function");
  if (typeof downloadConnection.evaluateWifiOnlyDownload !== "function") return;

  assert.deepEqual(
    downloadConnection.evaluateWifiOnlyDownload(true, { status: "wifi" }),
    { allowed: true, reason: "wifi", message: "" },
  );
  assert.deepEqual(
    downloadConnection.evaluateWifiOnlyDownload(true, { status: "non-wifi", type: "cellular" }),
    {
      allowed: false,
      reason: "non-wifi",
      message: "Wi-Fi-only downloads are enabled. Connect to Wi-Fi or turn off this setting to download.",
    },
  );
  assert.deepEqual(
    downloadConnection.evaluateWifiOnlyDownload(true, { status: "unknown" }),
    {
      allowed: false,
      reason: "unknown",
      message: "This browser can’t verify whether you’re on Wi-Fi. To keep Wi-Fi-only downloads strict, this download was blocked. Turn off Wi-Fi-only downloads to continue.",
    },
  );
});

test("downloads remain allowed when Wi-Fi-only mode is disabled", () => {
  assert.equal(typeof downloadConnection.evaluateWifiOnlyDownload, "function");
  if (typeof downloadConnection.evaluateWifiOnlyDownload !== "function") return;
  assert.deepEqual(
    downloadConnection.evaluateWifiOnlyDownload(false, { status: "unknown" }),
    { allowed: true, reason: "disabled", message: "" },
  );
});
