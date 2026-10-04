import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}

async function source(relative) {
  return readFile(path.join(root, relative), "utf8");
}

test("YouTubePlayer no longer owns duplicate fullscreen or mobile presentation state", async () => {
  const player = await source("src/components/MusicPlayer/YouTubePlayer.jsx");
  assert.doesNotMatch(player, /const \[expanded\s*,\s*setExpanded\]/);
  assert.doesNotMatch(player, /const \[mobileSheet\s*,\s*setMobileSheet\]/);
  assert.doesNotMatch(player, /const \[sheetTab\s*,\s*setSheetTab\]/);
  assert.match(player, /heykasa:media-presentation-command/);
});

test("shared responsive policy owns semantic phone and compact-touch queries", async () => {
  const policy = await source("src/utils/responsivePolicy.mjs");
  assert.match(policy, /PHONE_QUERY/);
  assert.match(policy, /COMPACT_TOUCH_QUERY/);

  for (const file of [
    "src/components/Layout/AppShell.jsx",
    "src/components/Searchbar.jsx",
    "src/components/MusicPlayer/MediaPresentation.tsx",
  ]) {
    const content = await source(file);
    assert.match(content, /responsivePolicy|useIsPhoneViewport|PHONE_QUERY|COMPACT_TOUCH_QUERY/, file);
    assert.doesNotMatch(content, /matchMedia\(["']\(max-width:\s*767px\)/, file);
  }
});

test("phone navigation and touch actions do not fall back to width-only visibility rules", async () => {
  for (const file of [
    "src/components/Layout/AppShell.jsx",
    "src/components/Navbar.jsx",
    "src/components/Sidebar/Sidebar.jsx",
    "src/components/Homepage/HomeHeader.jsx",
    "src/components/Layout/MobileTabBar.jsx",
    "src/components/Jam/JamController.jsx",
    "src/components/Homepage/HomeRail.jsx",
  ]) {
    const content = await source(file);
    assert.doesNotMatch(content, /(?:md:hidden|hidden md:inline-flex|max-md:hidden|md:opacity-0|sm:opacity-0)/, file);
  }

  for (const file of [
    "src/components/Homepage/HomeRail.jsx",
    "src/components/Library/PlaylistTrackRow.jsx",
    "src/components/Library/LibraryView.jsx",
  ]) {
    const content = await source(file);
    assert.match(content, /pointer-hover-action/, file);
    assert.doesNotMatch(content, /(?:md:opacity-0|sm:opacity-0)/, file);
  }

  const css = await source("src/app/globals.css");
  assert.match(css, /\(hover:\s*hover\) and \(pointer:\s*fine\)/);
});

test("production YouTube search callers go through the purpose-aware URL builder", async () => {
  const srcRoot = path.join(root, "src");
  const files = (await walk(srcRoot)).filter((file) => /\.(?:js|jsx|mjs|ts|tsx)$/.test(file));
  const offenders = [];
  for (const file of files) {
    const relative = path.relative(root, file).replaceAll(path.sep, "/");
    if (relative === "src/app/api/youtube-search/route.js") continue;
    if (relative === "src/utils/youtubeSearchUrl.mjs") continue;
    const content = await readFile(file, "utf8");
    if (content.includes("/api/youtube-search?")) offenders.push(relative);
  }
  assert.deepEqual(offenders, []);
});

test("retired media capability fields are isolated to the migration boundary", async () => {
  const srcRoot = path.join(root, "src");
  const files = (await walk(srcRoot)).filter((file) => /\.(?:js|jsx|mjs|ts|tsx)$/.test(file));
  const offenders = [];
  for (const file of files) {
    const relative = path.relative(root, file).replaceAll(path.sep, "/");
    if (relative === "src/utils/settingsMigration.mjs") continue;
    const content = await readFile(file, "utf8");
    if (/\b(?:streamingQuality|videoQuality|spatialAudio)\b/.test(content)) offenders.push(relative);
  }
  assert.deepEqual(offenders, []);
});

test("Electron remains a thin native shell rather than a second product frontend", async () => {
  const pkg = JSON.parse(await source("desktop/package.json"));
  const dependencies = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  for (const name of ["react", "react-dom", "next", "react-redux", "@reduxjs/toolkit"]) {
    assert.equal(name in dependencies, false, `desktop must not depend on ${name}`);
  }

  const desktopFiles = (await walk(path.join(root, "desktop", "src")))
    .filter((file) => /\.(?:js|mjs|cjs|html)$/.test(file));
  const forbidden = [];
  for (const file of desktopFiles) {
    const content = await readFile(file, "utf8");
    if (/from\s+["']\.\.\/\.\.\/src\//.test(content)) forbidden.push(path.relative(root, file));
    if (/\b(?:PlaylistDetail|LibraryView|Searchbar)\b/.test(content)) forbidden.push(path.relative(root, file));
  }
  assert.deepEqual([...new Set(forbidden)], []);
});


test("YouTube playback does not receive compute-pressure permission", async () => {
  const player = await source("src/components/MusicPlayer/YouTubePlayer.jsx");
  const nextConfig = await source("next.config.js");
  assert.doesNotMatch(player, /compute-pressure/);
  assert.match(nextConfig, /compute-pressure=\(\)/);
  assert.doesNotMatch(nextConfig, /compute-pressure=\([^)]*youtube/i);
});


test("notification playback uses the current finite-queue contract", async () => {
  const updates = await source("src/components/UpdatesBell.jsx");
  assert.doesNotMatch(updates, /\bradio:\s*(?:true|false)/);
  assert.match(updates, /queueMode:\s*"collection"/);
  assert.match(updates, /autoExtend:\s*false/);
});


test("keyboard transport has one active owner per playback provider", async () => {
  const shell = await source("src/components/MusicPlayer/index.jsx");
  const youtube = await source("src/components/MusicPlayer/YouTubePlayer.jsx");

  assert.match(shell, /enabled:\s*canControl && !isTyping && !youtubeVideo/);
  assert.match(shell, /onToggleMute:\s*keyboardShortcuts !== false \? toggleMute : undefined/);

  assert.match(youtube, /useKeyboardShortcuts\(\{[\s\S]*onTogglePlay:\s*handlePlayPause[\s\S]*onPrevious:\s*handlePrev[\s\S]*onNext:\s*handleNext[\s\S]*onSeekRelative:\s*seekBy/);
  assert.doesNotMatch(youtube, /event\.code === "Space"/);
  assert.doesNotMatch(youtube, /event\.key === "m" \|\| event\.key === "M"/);
});


test("home playback preserves explicit occurrence selection in a continuing radio queue", async () => {
  const [queue, slice, home] = await Promise.all([
    source("src/utils/playerQueue.mjs"),
    source("src/redux/features/playerSlice.js"),
    source("src/utils/playHome.js"),
  ]);
  assert.match(queue, /export function resolveQueueStartIndex/);
  assert.match(slice, /resolveQueueStartIndex/);
  assert.match(slice, /action\.payload\?\.index/);
  assert.match(home, /const selectedIndex =/);
  assert.match(home, /list\.slice\(selectedIndex\)/);
  assert.match(home, /index:\s*0/);
  assert.match(home, /queueMode:\s*"radio"/);
  assert.doesNotMatch(home, /autoExtend:\s*false/);
});
