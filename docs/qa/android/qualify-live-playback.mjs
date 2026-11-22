import fs from "node:fs";
import { pathToFileURL } from "node:url";

function requireEvidence(condition, reason) {
  if (!condition) throw new Error(`Live playback qualification failed: ${reason}`);
}
function playing(sample) {
  if (sample?.schemaVersion !== 1) return false;
  const y = sample.youtube;
  const embedded = sample.activeIframeMatched === true && y?.state === 1
    && Number.isFinite(y.position) && y.position > 2 && y.muted === false
    && Number.isFinite(y.volume) && y.volume > 0;
  const native = Array.isArray(sample.media) && sample.media.some(audio => audio?.native === true
    && audio.paused === false && audio.muted === false && Number.isFinite(audio.position)
    && audio.position > 2 && Number.isFinite(audio.volume) && audio.volume > 0 && !audio.mediaError);
  return embedded || native;
}

// Error-handling instrumentation is valuable but is not playback qualification.
// Only evidence from this run's exact source and both live user actions passes.
export function qualifyLivePlayback(report, { api, commit } = {}) {
  requireEvidence([33, 36].includes(api) && /^[a-f0-9]{40}$/.test(commit || ""), "expected API/source identity is invalid");
  requireEvidence(report?.androidApi === api && report.webSourceCommit === commit, "evidence belongs to another API or source commit");
  requireEvidence(report.webMode === "runner_current_production_build_with_live_public_apis"
    && report.currentBuildDocuments > 0 && report.currentSourceRequests > 0, "current build was not exercised");
  requireEvidence(report.outcome === "playback_progress_with_nonzero_output_settings" && playing(report.sample), "no verified live playback");
  requireEvidence(Number.isFinite(report.systemMusicVolume) && report.systemMusicVolume > 0, "system output volume is zero or unknown");
  requireEvidence(report.pauseVerified === true, "Pause was not verified after live playback");
  requireEvidence(report.manualSkipVerified === true && report.manualSkip?.selectedSongChanged === true
    && report.manualSkip.outcome === "next_song_playback_progress_with_nonzero_output_settings"
    && playing(report.manualSkip.sample), "Next did not produce verified playback on a different selection");
  // Emulator output settings do not establish human audibility or which backend
  // extracted the source. Those remain separate release qualification gates.
  return { qualified: true, androidApi: api, sourceCommit: commit, physicalSpeakerAudibilityVerified: false, ytDlpVerified: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [file, api, commit] = process.argv.slice(2);
    requireEvidence(file && fs.statSync(file).size <= 1024 * 1024, "evidence missing or exceeds size limit");
    const result = qualifyLivePlayback(JSON.parse(fs.readFileSync(file, "utf8")), { api: Number(api), commit });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error instanceof Error && error.message.startsWith("Live playback qualification failed:")
      ? error.message : "Live playback qualification failed: missing or malformed evidence");
    process.exitCode = 1;
  }
}
