// Execute the actual component callbacks with isolated state. This supplements
// (and does not replace) the native producer/WebView instrumentation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../../src/components/MusicPlayer/YouTubePlayer.jsx'), 'utf8');
const part = (start, end) => {
  const first = source.indexOf(start), last = source.indexOf(end, first);
  assert(first >= 0 && last > first, `Production callback missing: ${start}`);
  return source.slice(first, last);
};
let playing = false, error = null, pauses = 0, plays = 0, dispatches = 0;
const player = { orderedTransport: true, androidNative: true, nativePlayIntent: true,
  playVideo() { plays++; }, pauseVideo() { pauses++; }, getPlayerState: () => 1, unMute() {},
};
const context = {
  key: 'A', generation: 0, videoId: 'synthetic01', playerParams: new Map(), isCurrent: () => true,
  activeDeckRef: { current: 'A' }, userPausedRef: { current: true }, isPlayingRef: { current: false },
  store: { getState: () => ({ player: { isPlaying: playing } }) },
  dispatch(action) { playing = action; dispatches++; }, playPause: value => value,
  clearActiveBufferTimers() {}, setPlayerError(value) { error = typeof value === 'function' ? value(error) : value; },
  hasUnmutedOnce: true, firstPlayingHandled: true, activeTrackStartedRef: { current: { identity: 'one', videoId: 'synthetic01', startedAt: 1 } },
  queueEntryIdentity: () => 'one', videoRef: { current: { id: 'synthetic01' } }, playerVideoId: () => 'synthetic01',
  handoffWaitingRef: { current: null }, markActivePlaybackHealthy() {}, recordDiagnostic() {},
  MEDIA_PLAYER_STATES: { PLAYING: 1, PAUSED: 2, BUFFERING: 3, ENDED: 0, CUED: 5, UNSTARTED: -1 },
  crossfadeInProgressRef: { current: false }, isSeekGuarded: () => false, getActivePlayer: () => player,
  isPageHidden: () => false, shouldDeferYoutubeResume: () => false, backgroundAccountRef: { current: true },
  applyPlaybackVolume() {}, volumeRestoreRef: { current: { holds: () => false } },
};
vm.runInNewContext(part('const options = {', 'const occurrence = queueEntryIdentity(videoRef.current);')
  + '\nglobalThis.events = options.events;', context);

// A fresh native command updates intent independently of actual output or a
// pending React render. The old Pause observation must not send a new command.
context.events.onTransportIntent({ target: player, data: { playing: true, origin: 'system' } });
assert.equal(playing, true); assert.equal(context.userPausedRef.current, false);
assert.equal(context.isPlayingRef.current, true);
const before = dispatches;
context.events.onStateChange({ target: player, data: 2 });
assert.equal(dispatches, before); assert.equal(pauses, 0); assert.equal(plays, 0);

context.events.onTransportError({ target: player, data: { code: 'TIMEOUT' } });
assert.equal(error.kind, 'transport');
context.userPausedRef.current = true; context.isPlayingRef.current = false;
context.events.onStateChange({ target: player, data: 1 });
assert.equal(pauses, 0, 'Qualified playing never posts a corrective Pause from stale React state');
assert.equal(error.kind, 'transport', 'Audible output does not establish control-channel recovery');
context.events.onTransportRecovered(); assert.equal(error, null);

vm.runInNewContext(part('const resumePlayer = (player,', 'const markSeek =')
  + '\nglobalThis.resume = resumePlayer;', context);
context.resume(player); assert.equal(plays, 0, 'Watchdogs/visibility may not manufacture ordered Play');
context.resume(player, { explicitUserAction: true }); assert.equal(plays, 1);

// Exercise the actual Redux effect, including a render that predates the
// latest native event. Reading that stale render would replay an unwanted Play.
context.isPlaying = true;
context.useEffect = effect => { context.effect = effect; };
vm.runInNewContext(part('useEffect(() => {\n    if (crossfadeInProgressRef.current || isSeekGuarded()) return;', 'useEffect(() => {\n    const canRestoreVolume'), context);
playing = false; player.nativePlayIntent = false;
context.effect(); assert.equal(plays, 1); assert.equal(pauses, 0);
context.isPlaying = false; playing = true; player.nativePlayIntent = true;
context.effect(); assert.equal(plays, 1); assert.equal(pauses, 0);
playing = false; player.nativePlayIntent = true;
context.effect(); assert.equal(pauses, 1, 'A fresh application Pause still reaches native');

console.log('PASS: production component intent/observation/error callbacks, stale React effect isolation, watchdog exclusion and explicit native commands (isolated state; no device/source claim).');
