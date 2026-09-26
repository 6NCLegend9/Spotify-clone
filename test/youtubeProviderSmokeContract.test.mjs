import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { classifyYoutubeProviderFailure } from "../src/utils/youtubeProviderFailure.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

test("classifies explicit YouTube provider outages as external", () => {
  assert.equal(classifyYoutubeProviderFailure({
    requestFailures: ["https://www.youtube.com/iframe_api net::ERR_NAME_NOT_RESOLVED"],
  }), "external-provider");
  assert.equal(classifyYoutubeProviderFailure({
    responseStatuses: [{ url: "https://www.youtube.com/iframe_api", status: 503 }],
  }), "external-provider");
  assert.equal(classifyYoutubeProviderFailure({
    playerErrorCodes: [101],
  }), "external-provider");
});

test("classifies HayKasa integration failures as blocking integration errors", () => {
  assert.equal(classifyYoutubeProviderFailure({
    message: "youtube iframe never mounted after YT.Player became available",
    providerApiLoaded: true,
  }), "integration");
  assert.equal(classifyYoutubeProviderFailure({
    message: "player dock missing",
    providerApiLoaded: true,
  }), "integration");
});

test("unknown failures stay blocking rather than being silently ignored", () => {
  assert.equal(classifyYoutubeProviderFailure({ message: "unexpected assertion" }), "unknown");
});

test("provider workflow is not blanket continue-on-error", () => {
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/youtube-provider-smoke.yml"), "utf8");
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
  assert.match(workflow, /youtubeProviderFailure\.mjs|youtube-provider\.spec\.js/);
});
