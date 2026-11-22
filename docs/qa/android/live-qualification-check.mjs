import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { qualifyLivePlayback } from "./qualify-live-playback.mjs";

const commit = "a".repeat(40);
const sample = () => ({ schemaVersion: 1, activeIframeMatched: true,
  youtube: { state: 1, position: 3, muted: false, volume: 75 }, media: [] });
function evidence() {
  return { androidApi: 33, webMode: "runner_current_production_build_with_live_public_apis", webSourceCommit: commit,
    currentBuildDocuments: 1, currentSourceRequests: 1, systemMusicVolume: 5,
    outcome: "playback_progress_with_nonzero_output_settings", sample: sample(), pauseVerified: true,
    manualSkipVerified: true, manualSkip: { outcome: "next_song_playback_progress_with_nonzero_output_settings", selectedSongChanged: true, sample: sample() } };
}
const qualify = report => qualifyLivePlayback(report, { api: 33, commit });
test("live output state, Pause and real Next qualify without claiming audibility or yt-dlp", () => {
  assert.deepEqual(qualify(evidence()), { qualified: true, androidApi: 33, sourceCommit: commit, physicalSpeakerAudibilityVerified: false, ytDlpVerified: false });
});
for (const [name, mutate] of [
  ["provider rejection", r => { r.outcome = "no_verified_playback"; }],
  ["missing evidence", r => { delete r.sample; }],
  ["wrong API", r => { r.androidApi = 36; }],
  ["wrong commit", r => { r.webSourceCommit = "b".repeat(40); }],
  ["old deployed UI", r => { r.webMode = "deployed_production"; }],
  ["missing current build", r => { r.currentBuildDocuments = 0; }],
  ["muted output", r => { r.sample.youtube.muted = true; }],
  ["unmatched iframe", r => { r.sample.activeIframeMatched = false; }],
  ["silent system", r => { r.systemMusicVolume = 0; }],
  ["Pause not checked", r => { r.pauseVerified = false; }],
  ["Next only showed an error", r => { r.manualSkip.outcome = "next_song_provider_failure_visible_and_paused"; }],
  ["Next did not change selection", r => { r.manualSkip.selectedSongChanged = false; }],
  ["Next output stopped", r => { r.manualSkip.sample.youtube.state = 2; }],
]) test(`rejects ${name}`, () => {
  const report = evidence(); mutate(report); assert.throws(() => qualify(report));
});
test("native output can qualify without a YouTube iframe", () => {
  const report = evidence();
  for (const s of [report.sample, report.manualSkip.sample]) {
    s.youtube = {}; s.activeIframeMatched = false;
    s.media = [{ native: true, paused: false, muted: false, position: 4, volume: 1, mediaError: 0 }];
  }
  assert.equal(qualify(report).qualified, true);
});

// Execute the publisher's actual admission block; the complete CLI regression
// suite also runs on Linux CI with its isolated git/gh/signature tool fixtures.
const publisher = fs.readFileSync(new URL("../../../scripts/publish-android-preview.mjs", import.meta.url), "utf8");
const admission = publisher.slice(publisher.indexOf("  const jobs = completeList("), publisher.indexOf("  const artifacts = completeList("));
const admit = new Function("completeList", "requireValue", "runId", "run", admission);
function publication(jobs) {
  admit(() => jobs, (condition, reason) => { if (!condition) throw Error(reason); }, "123", { id: 123, head_sha: commit });
}
const jobs = ["apk", "Android 33 emulator", "Android 36 emulator", "Live Android playback qualification"]
  .map(name => ({ name, status: "completed", conclusion: "success", run_id: 123, head_sha: commit }));
test("publication requires the exact-run live qualification job", () => {
  publication(jobs);
  assert.throws(() => publication(jobs.slice(0, 3)));
  for (const override of [{ conclusion: "failure" }, { conclusion: "skipped" }, { head_sha: "b".repeat(40) }, { run_id: 124 }]) {
    assert.throws(() => publication([...jobs.slice(0, 3), { ...jobs[3], ...override }]));
  }
});
