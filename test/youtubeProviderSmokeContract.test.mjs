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


test("real provider smoke exercises playback and captures provider player errors", () => {
  const spec = fs.readFileSync(path.join(root, "e2e/youtube-provider.spec.js"), "utf8");
  const player = fs.readFileSync(path.join(root, "src/components/MusicPlayer/YouTubePlayer.jsx"), "utf8");
  assert.match(spec, /getByRole\("button",\s*\{\s*name:\s*"Play"/);
  assert.match(spec, /Song progress/);
  assert.match(spec, /heykasa:youtube-provider-error/);
  assert.match(player, /heykasa:youtube-provider-error/);
});


test("real provider smoke falls back when one video loses embed permission", () => {
  const spec = fs.readFileSync(path.join(root, "e2e/youtube-provider.spec.js"), "utf8");
  assert.match(spec, /PROVIDER_SMOKE_TRACKS/);
  assert.match(spec, /aqz-KE-bpKQ/);
  assert.match(spec, /jNQXAC9IVRw/);
  assert.match(spec, /EMBED_RESTRICTION_CODES/);
  assert.match(spec, /provider-smoke-index/);
});


test("provider workflow reports verified versus inconclusive playback explicitly", () => {
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/youtube-provider-smoke.yml"), "utf8");
  const spec = fs.readFileSync(path.join(root, "e2e/youtube-provider.spec.js"), "utf8");
  assert.match(spec, /writeProviderStatus\("verified"/);
  assert.match(spec, /writeProviderStatus\("inconclusive"/);
  assert.match(workflow, /youtube-provider-status\.json/);
  assert.match(workflow, /YouTube playback verification inconclusive/);
  assert.match(workflow, /next\.config\.js/);
});


test("real provider workflow covers desktop and both mobile browser engines", () => {
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/youtube-provider-smoke.yml"), "utf8");
  const spec = fs.readFileSync(path.join(root, "e2e/youtube-provider.spec.js"), "utf8");
  for (const project of ["chromium-desktop", "mobile-chrome", "mobile-safari"]) {
    assert.match(workflow, new RegExp(`project:\\s*${project.replace("-", "\\-")}`));
  }
  assert.match(workflow, /\$\{\{ matrix\.project \}\}/);
  assert.match(workflow, /\$\{\{ matrix\.browser \}\}/);
  assert.match(spec, /testInfo\.project\.name\.startsWith\("mobile-"\)/);
  assert.match(spec, /name:\s*"Expand video"/);
});
