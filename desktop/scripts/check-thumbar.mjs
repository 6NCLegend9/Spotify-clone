import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { promisify } from "node:util";
import { app, BrowserWindow, nativeImage } from "electron";
import { isPlaybackCommand } from "../src/playback.mjs";

const output = path.resolve("artifacts/desktop-thumbar");
fs.mkdirSync(output, { recursive: true });
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "haykasa-thumbar-")));
const report = { platform: process.platform, runtime: { electron: process.versions.electron, chromium: process.versions.chrome, node: process.versions.node }, icons: [], states: [], commands: [], passed: false };
let window;
const runPowerShell = promisify(execFile);

async function deliverThumbnailClick(testWindow, index) {
  const handle = testWindow.getNativeWindowHandle();
  const hwnd = handle.length === 8 ? handle.readBigUInt64LE() : BigInt(handle.readUInt32LE());
  // Send the documented thumbnail notification only to our test-owned window.
  // Electron 44 starts its thumbnail button IDs at 40001.
  const notification = (0x1800 << 16) | (40001 + index);
  const command = `
Add-Type -Namespace HayKasaTest -Name Native -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll", SetLastError=true)]
public static extern bool PostMessage(System.IntPtr window, uint message, System.UIntPtr wParam, System.IntPtr lParam);
'@
if (-not [HayKasaTest.Native]::PostMessage([IntPtr]::new([long]${hwnd}), 0x0111, [UIntPtr]::new([uint32]${notification}), [IntPtr]::Zero)) {
    throw 'Could not post the thumbnail click to the test window.'
}
`;
  await runPowerShell("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { windowsHide: true, timeout: 15000 });
}

app.whenReady().then(async () => {
try {
  assert.equal(process.platform, "win32", "Run the native thumbnail-toolbar check on Windows");
  const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(report.runtime.electron, pkg.devDependencies.electron, "Exercise the declared shipped Electron runtime");
  const directory = fileURLToPath(new URL("../src/", import.meta.url));
  const source = fs.readFileSync(path.join(directory, "main.mjs"), "utf8");
  const start = source.indexOf("function thumbarIcon(");
  const end = source.indexOf("function assertMiniOrTrustedIpcEvent(", start);
  assert(start >= 0 && end > start);
  const sendStart = source.indexOf("function sendPlaybackCommand(");
  const sendEnd = source.indexOf("function broadcastPlayback(", sendStart);
  assert(sendStart >= 0 && sendEnd > sendStart);
  let buttons;
  const context = vm.createContext({
    nativeImage, path, __dirname: directory, process: { platform: "win32" },
    isPlaybackCommand, canMessageRenderer: () => Boolean(window && !window.isDestroyed()),
    qaWindow: {
      isDestroyed: () => false,
      setThumbarButtons: value => { buttons = value; },
      webContents: { send: (...args) => window.webContents.send(...args) },
    },
  });
  vm.runInContext(`let mainWindow = qaWindow; let playbackState = {}; ${source.slice(sendStart, sendEnd)} ${source.slice(start, end)}`, context);
  const digest = image => crypto.createHash("sha256").update(image.toPNG()).digest("hex");
  const digests = new Set();
  for (const kind of ["previous", "play", "pause", "next"]) {
    const image = context.thumbarIcon(kind);
    assert.equal(image.isEmpty(), false, `${kind}: the actual Windows decoder must load the icon`);
    assert.deepEqual(image.getSize(), { width: 16, height: 16 });
    const pixels = image.toBitmap({ scaleFactor: 1 });
    assert.equal(pixels.length, 16 * 16 * 4);
    let visible = 0, transparent = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      if (pixels[offset + 3]) visible++;
      else transparent++;
    }
    assert(visible > 0 && transparent > 0, `${kind}: a visible glyph on a transparent background`);
    const highDpi = nativeImage.createFromPath(path.join(directory, "icons", "thumbar", `${kind}@2x.png`));
    assert.equal(highDpi.isEmpty(), false, `${kind}: high-DPI companion decodes`);
    digests.add(digest(image));
    fs.writeFileSync(path.join(output, `${kind}.png`), image.toPNG());
    report.icons.push({ kind, size: image.getSize(), scaleFactors: image.getScaleFactors(), visible, transparent });
  }
  assert.equal(digests.size, 4, "Previous, Play, Pause and Next have distinct images");
  const legacySvg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><path fill="white" d="M5 3.5v9l8-4.5-8-4.5Z"/></svg>';
  report.legacySvgEmpty = nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(legacySvg)}`).isEmpty();

  window = new BrowserWindow({ width: 640, height: 360, title: "HayKasa taskbar controls QA", show: false,
    webPreferences: { preload: path.join(directory, "preload.cjs"), sandbox: true, nodeIntegration: false, contextIsolation: true } });
  await window.loadURL("data:text/html,<title>HayKasa taskbar controls QA</title><p>Native thumbnail-toolbar verification</p>");
  await window.webContents.executeJavaScript(`
    window.receivedCommands = [];
    window.heykasaDesktop.playback.onCommand(command => window.receivedCommands.push(command));
    undefined;
  `);
  window.show();
  for (const state of [
    { name: "paused", playing: false, canPrev: true, canPlay: true, canSkip: true },
    { name: "playing", playing: true, canPrev: true, canPlay: true, canSkip: true },
    { name: "empty", playing: false, canPrev: false, canPlay: false, canSkip: false },
  ]) {
    context.nextState = state;
    vm.runInContext("playbackState = nextState; updateThumbar()", context);
    assert.equal(buttons.length, 3);
    assert.deepEqual(Array.from(buttons, button => button.tooltip), ["Previous", state.playing ? "Pause" : "Play", "Next"]);
    for (const [index, kind] of ["previous", state.playing ? "pause" : "play", "next"].entries()) {
      assert.equal(digest(buttons[index].icon), digest(context.thumbarIcon(kind)));
      assert.deepEqual(Array.from(buttons[index].flags), state.name === "empty" ? ["disabled"] : []);
    }
    assert.equal(window.setThumbarButtons(Array.from(buttons)), true, `${state.name}: Windows accepts the native toolbar`);
    if (state.name !== "empty") {
      for (const [index, expected] of ["prev", "play-pause", "skip"].entries()) {
        const count = report.commands.length;
        await deliverThumbnailClick(window, index);
        for (let attempt = 0; attempt < 25; attempt++) {
          report.commands = await window.webContents.executeJavaScript("window.receivedCommands.slice()");
          if (report.commands.length > count) break;
          await new Promise(resolve => setTimeout(resolve, 40));
        }
        assert.deepEqual(report.commands.slice(count), [expected], `${state.name}: thumbnail click reaches the preload listener as ${expected}`);
      }
    }
    report.states.push({ name: state.name, tooltips: Array.from(buttons, button => button.tooltip), nativeToolbarAccepted: true });
  }
  assert.deepEqual(report.commands, ["prev", "play-pause", "skip", "prev", "play-pause", "skip"]);
  report.passed = true;
  console.log("PASS: native thumbnail notifications reach the sandboxed playback listener and preserve icons and disabled states");
} catch (error) {
  report.error = error.stack || error.message;
  console.error(report.error);
} finally {
  window?.destroy();
  fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(report, null, 2));
  app.exit(report.passed ? 0 : 1);
}
});
