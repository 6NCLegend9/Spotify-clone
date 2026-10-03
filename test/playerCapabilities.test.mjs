import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("captions remain user-controlled from settings to the player", async () => {
  const [settings, store, dock] = await Promise.all([
    read("src/redux/features/settingsSlice.js"),
    read("src/redux/store.js"),
    read("src/components/MusicPlayer/PlayerDock.tsx"),
  ]);
  assert.equal((settings.match(/captions:\s*false/g) || []).length, 1);
  assert.doesNotMatch(settings, /key === ["']captions["']/);
  assert.doesNotMatch(store, /captions:\s*false/);
  assert.doesNotMatch(dock, /unloadModule.+captions/);
});

test("sleep timer UI is wired to the persistent timer controller", async () => {
  const [hook, control] = await Promise.all([
    read("src/hooks/useSleepTimer.js"),
    read("src/components/MusicPlayer/SleepTimerControl.jsx"),
  ]);
  assert.match(hook, /createSleepTimer/);
  assert.match(hook, /trackChanged\(trackId\)/);
  assert.match(control, /aria-label="Sleep timer"/);
  assert.match(control, /value="track"/);
  assert.match(control, /value="60"/);
});

test("expanded video lets the overlay own taps so hide/show cannot cancel itself", async () => {
  const [css, presentation] = await Promise.all([
    read("src/components/MusicPlayer/mediaPresentation.module.css"),
    read("src/components/MusicPlayer/MediaPresentation.tsx"),
  ]);
  assert.match(css, /\.theater\[data-media="video"\]\s*\{[^}]*pointer-events:\s*auto/);
  assert.match(css, /\.theater\[data-media="video"\] \.expandedArt\s*\{[^}]*pointer-events:\s*none/);
  assert.match(css, /\.theaterChrome\s*\{[^}]*pointer-events:\s*auto/);
  assert.match(presentation, /\{!expanded && <div className=\{styles\.gestureSurface\}/);
  assert.match(presentation, /onPointerMove=\{moveMediaPointer\}/);
  assert.match(presentation, /controlsRevealedByPointerMoveRef\.current = true/);
  assert.match(presentation, /if \(controlsRevealedByPointerMoveRef\.current\)/);
  assert.match(presentation, /if \(!expanded \|\| event\.pointerType !== "mouse"\) return;[\s\S]*showTheaterControls\(\);/);
});

test("legacy F/V fullscreen stays off while a KASA overlay is open", async () => {
  const player = await read("src/components/MusicPlayer/YouTubePlayer.jsx");
  assert.match(player, /kasa-media-overlay/);
  assert.match(player, /mediaTheater \|\| document\.querySelector/);
});

test("queue overlay traps keyboard focus", async () => {
  const queue = await read("src/components/MusicPlayer/ExpandedPlayer.tsx");
  assert.match(queue, /useFocusTrap/);
  assert.match(queue, /enabled:\s*true/);
});

test("audio-focused YouTube mode keeps a supported iframe viewport", async () => {
  const [css, policy] = await Promise.all([
    read("src/app/globals.css"),
    import("../src/utils/youtubePresentationPolicy.mjs"),
  ]);
  assert.doesNotMatch(css, /\.yt-audio-stage\s*\{[^}]*width:\s*2px/i);
  assert.doesNotMatch(css, /\.yt-audio-stage\s*\{[^}]*height:\s*2px/i);
  assert.ok(policy.HIDDEN_YOUTUBE_VIEWPORT.width >= 200);
  assert.ok(policy.HIDDEN_YOUTUBE_VIEWPORT.height >= 200);
  assert.match(css, /\.yt-audio-stage \.yt-crop-frame,[\s\S]*width:\s*100% !important;[\s\S]*height:\s*100% !important;/);
});

test("video stays visible through the final seconds instead of activating an end-screen mask", async () => {
  const [dock, sanitizer] = await Promise.all([
    read("src/components/MusicPlayer/PlayerDock.tsx"),
    read("src/components/MusicPlayer/youtubeSanitizer.module.css"),
  ]);
  assert.doesNotMatch(dock, /END_SCREEN_MASK_SECONDS|kasaEndGuard|data-kasa-end-guard/);
  assert.doesNotMatch(sanitizer, /data-kasa-end-guard/);
});


test("MediaPresentation is the only interactive video presentation owner", async () => {
  const [dock, types, player, presentation, globals] = await Promise.all([
    read("src/components/MusicPlayer/PlayerDock.tsx"),
    read("src/components/MusicPlayer/player.types.ts"),
    read("src/components/MusicPlayer/YouTubePlayer.jsx"),
    read("src/components/MusicPlayer/MediaPresentation.tsx"),
    read("src/app/globals.css"),
  ]);

  assert.match(types, /videoAvailable\?:\s*boolean/);
  assert.doesNotMatch(types, /onVideo\?:\s*\(\)\s*=>\s*void/);
  assert.match(dock, /heykasa:media-presentation-command/);
  assert.match(dock, /presentationRef\.current\?\.expand\(\)/);
  assert.match(presentation, /const canVideo = props\.videoAvailable === true/);
  assert.match(presentation, /dispatch\(setFullScreen\(expanded\)\)/);
  assert.doesNotMatch(player, /onVideo=\{videoVisible \? toggleExpanded/);
  assert.match(player, /videoAvailable=\{videoVisible\}/);
  assert.doesNotMatch(player, /const \[expanded, setExpanded\] = useState/);
  assert.doesNotMatch(player, /setExpanded\(next\)/);
  assert.doesNotMatch(player, /const expanded = false/);
  assert.doesNotMatch(player, /\bmobileSheet\b|\bsetMobileSheet\b/);
  assert.doesNotMatch(player, /\bsheetTab\b|\bsetSheetTab\b/);
  assert.doesNotMatch(player, /\bimmersive\b|\bsetImmersive\b|\bimmersiveRef\b/);
  assert.doesNotMatch(player, /\bchromeVisible\b|\bsetChromeVisible\b|\bchromeVisibleRef\b/);
  assert.doesNotMatch(player, /\bphoneSheet\b|\bsheetChrome\b|\bexpandedLayout\b/);
  assert.doesNotMatch(player, /onFullscreenSwipeStart|onFullscreenSwipeEnd|toggleSheetTab/);
  assert.doesNotMatch(globals, /\.yt-video-expanded|\.yt-phone-(?:stage|video|chrome)|\.yt-expand-(?:stage|chrome)|\.yt-mobile-sheet|\.yt-queue-panel|\.lyrics-panel--expanded/);
});


test("presentation cleanup keeps playback-control refs declared and removes stale expand lock", async () => {
  const player = await read("src/components/MusicPlayer/YouTubePlayer.jsx");
  for (const refName of ["userPausedRef", "pageHiddenWhilePlayingRef", "trackChangeUntilRef"]) {
    assert.match(player, new RegExp(`const ${refName} = useRef\\(`));
  }
  assert.doesNotMatch(player, /\bexpandLockRef\b/);
});


test("YouTube audio-focused and data-saver copy stays truthful about provider media", async () => {
  const settings = await read("src/app/settings/page.jsx");
  assert.match(settings, /label="Audio-focused mode"/);
  assert.doesNotMatch(settings, /label="Audio-only mode"/);
  assert.match(settings, /This is not a separate audio-only YouTube stream/);
  assert.match(settings, /YouTube still chooses the media stream and quality/);
});

test("hidden YouTube playback uses one shared supported viewport policy", async () => {
  const [player, presentation, css] = await Promise.all([
    read("src/components/MusicPlayer/YouTubePlayer.jsx"),
    read("src/components/MusicPlayer/MediaPresentation.tsx"),
    read("src/app/globals.css"),
  ]);
  assert.match(player, /HIDDEN_YOUTUBE_VIEWPORT/);
  assert.match(presentation, /HIDDEN_YOUTUBE_VIEWPORT/);
  assert.doesNotMatch(presentation, /visible \? rect!\.width : 320/);
  assert.doesNotMatch(presentation, /visible \? rect!\.height : 180/);
  assert.doesNotMatch(css, /\.yt-audio-stage\s*\{[^}]*width:\s*200px/i);
  assert.doesNotMatch(css, /\.yt-audio-stage\s*\{[^}]*height:\s*200px/i);
  assert.match(css, /\.yt-audio-stage \.yt-crop-frame,[\s\S]*width:\s*100% !important;[\s\S]*height:\s*100% !important;/);
});


test("mobile drawer raises the live video above the opaque sheet while theater stays below KASA chrome", async () => {
  const presentation = await read("src/components/MusicPlayer/MediaPresentation.tsx");
  assert.match(
    presentation,
    /const presentationZ = expanded \? "69" : drawer && showingVideo \? "71" : "30"/,
  );
  assert.match(presentation, /region\.style\.setProperty\("z-index", presentationZ\)/);
});

test("volume popover escapes scroll containers and stays viewport-positioned", async () => {
  const [volume, css] = await Promise.all([
    read("src/components/MusicPlayer/PlayerVolume.jsx"),
    read("src/app/globals.css"),
  ]);
  assert.match(volume, /createPortal/);
  assert.match(volume, /window\.visualViewport/);
  assert.match(volume, /data-testid="player-volume-popover"/);
  assert.match(css, /\.player-volume-popover\s*\{[^}]*position:\s*fixed;[^}]*z-index:\s*150;/s);
});

test("lyrics fetches are demand-driven instead of running for every playing track", async () => {
  const [youtubePlayer, nativePlayer] = await Promise.all([
    read("src/components/MusicPlayer/YouTubePlayer.jsx"),
    read("src/components/MusicPlayer/index.jsx"),
  ]);
  assert.match(
    youtubePlayer,
    /enabled:\s*Boolean\(video\?\.title\) && syncedLyrics !== false && Boolean\(pipWindow\)/,
  );
  assert.match(
    nativePlayer,
    /enabled:\s*Boolean\(nativeTitle\) && !youtubeVideo && Boolean\(pipWindow\)/,
  );
});


test("portaled volume controls remain inside the media modal keyboard boundary", async () => {
  const presentation = await read("src/components/MusicPlayer/MediaPresentation.tsx");
  assert.match(presentation, /document\.querySelector\('\[data-testid="player-volume-popover"\]'\)/);
});


test("legacy native Lyrics surface does not own YouTube queue transitions", async () => {
  const lyrics = await read("src/components/MusicPlayer/Lyrics.jsx");
  assert.doesNotMatch(lyrics, /\byoutubeVideo\b|\byoutubeQueue\b|\bsetYoutubeVideo\b|\bplayPause\b/);
  assert.match(lyrics, /nativeQueue/);
});


test("mobile drawer exposes an explicit in-dialog video expand control without overflowing narrow phones", async () => {
  const [presentation, css] = await Promise.all([
    read("src/components/MusicPlayer/MediaPresentation.tsx"),
    read("src/components/MusicPlayer/mediaPresentation.module.css"),
  ]);
  assert.match(
    presentation,
    /const drawerExpandButton = mobile && showingVideo && !expanded/,
  );
  assert.match(presentation, /data-testid="mobile-expand-video"/);
  assert.match(
    presentation,
    /className=\{styles\.mediaTools\}>\{modeButton\}\{drawerExpandButton\}<\/div>/,
  );
  assert.match(
    presentation,
    /!mobile && !expanded && <button type="button" aria-label="Expand video"/,
    "the portaled over-video expand button must stay desktop-only",
  );
  assert.match(
    css,
    /\.mobileSheet \.mediaTools\s*\{[^}]*flex-wrap:\s*wrap;/s,
  );
});


test("volume popover positioning follows its rendered size instead of fixed pixel assumptions", async () => {
  const volume = await read("src/components/MusicPlayer/PlayerVolume.jsx");
  assert.match(volume, /popoverRef\.current\?\.getBoundingClientRect\(\)/);
  assert.match(volume, /new ResizeObserver\(update\)/);
  assert.doesNotMatch(volume, /const width = 152/);
  assert.doesNotMatch(volume, /const height = 72/);
});


test("YouTube Previous follows actual listening history instead of queue order", async () => {
  const player = await read("src/components/MusicPlayer/YouTubePlayer.jsx");
  assert.match(player, /\bplayPreviousFromHistory\b/);
  const handlePrev = player.match(/const handlePrev = \(\) => \{([\s\S]*?)\n  \};/);
  assert.ok(handlePrev, "handlePrev must remain an explicit player boundary");
  assert.match(handlePrev[1], /playbackHistory\.length/);
  assert.match(handlePrev[1], /dispatch\(playPreviousFromHistory\(\)\)/);
  assert.doesNotMatch(handlePrev[1], /getPreviousVideo\(\)/);
});


test("YouTube progress persistence is bound to the occurrence actually started on the active deck", async () => {
  const player = await read("src/components/MusicPlayer/YouTubePlayer.jsx");
  assert.match(player, /const progressIdentity = queueEntryIdentity\(videoRef\.current\)/);
  assert.match(player, /const progressQueueEntryId = videoRef\.current\?\.queueEntryId/);
  assert.match(player, /activeTrackStartedRef\.current\.identity === progressIdentity/);
  assert.match(player, /activeTrackStartedRef\.current\.startedAt/);
  assert.match(player, /setPlaybackPosition\(\{ id, queueEntryId: progressQueueEntryId, position: time \}\)/);
});


test("Jam playback state and remote seeks carry queue occurrence identity end to end", async () => {
  const [player, jamSession] = await Promise.all([
    read("src/components/MusicPlayer/YouTubePlayer.jsx"),
    read("src/hooks/useJamSession.js"),
  ]);
  assert.match(player, /JAM_PLAYBACK_STATE_EVENT,[\s\S]*queueEntryId:\s*videoRef\.current\?\.queueEntryId/);
  assert.match(jamSession, /jamPlaybackPositionMatchesTrack\(\s*playbackPositionRef\.current,\s*snapshot\.youtubeVideo,?\s*\)/);
  assert.match(jamSession, /jamPlaybackPositionMatchesTrack\(position, nextTrack\)/);
  assert.match(jamSession, /JAM_REMOTE_SEEK_EVENT,[\s\S]*queueEntryId:\s*nextTrack\.queueEntryId/);
  assert.match(player, /pendingJamSeekRef\.current = \{[\s\S]*queueEntryId:\s*detail\.queueEntryId/);
  assert.match(player, /queueOccurrenceMatches\(videoRef\.current, \{ id: pendingJamSeek\.videoId, queueEntryId: pendingJamSeek\.queueEntryId \}\)/);
});


test("Escape dismisses the portaled volume popover before closing Now Playing", async () => {
  const presentation = await read("src/components/MusicPlayer/MediaPresentation.tsx");
  assert.match(
    presentation,
    /if \(event\.key === "Escape" && document\.querySelector\('\[data-testid="player-volume-popover"\]'\)\) return;/,
  );
});
