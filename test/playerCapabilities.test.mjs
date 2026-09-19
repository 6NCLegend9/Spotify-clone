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

test("expanded video keeps a pointer surface for revealing hidden controls", async () => {
  const [css, presentation] = await Promise.all([
    read("src/components/MusicPlayer/mediaPresentation.module.css"),
    read("src/components/MusicPlayer/MediaPresentation.tsx"),
  ]);
  assert.match(css, /\.theater\[data-media="video"\]\s*\{[^}]*pointer-events:\s*auto/);
  assert.match(css, /\.theater\[data-media="video"\] \.expandedArt\s*\{[^}]*pointer-events:\s*auto/);
  assert.match(css, /\.gestureSurface\s*\{[^}]*pointer-events:\s*auto/);
  assert.match(presentation, /controlsRevealedByPointerMoveRef\.current = true/);
  assert.match(presentation, /if \(controlsRevealedByPointerMoveRef\.current\)/);
});
