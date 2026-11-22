import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow } from "electron";

app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "haykasa-mini-keyboard-")));
let window;
app.whenReady().then(async () => {
  let passed = false;
  try {
    window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await window.loadFile(fileURLToPath(new URL("../src/miniPlayer.html", import.meta.url)));
    const result = await window.webContents.executeJavaScript(`(() => {
      const track = { hasTrack: true, title: 'Keyboard test', artist: 'QA', canPlay: true, canPrev: true, canSkip: true, playing: false };
      render(track);
      const observations = [];
      for (const id of ['open', 'prev', 'play', 'skip']) {
        document.getElementById(id).focus();
        render({ ...track, playing: true });
        observations.push({ expected: id, actual: document.activeElement.id });
      }
      document.getElementById('hide').focus();
      render(track);
      const outsideFocus = document.activeElement.id;
      document.getElementById('skip').focus();
      render({ ...track, canSkip: false });
      const disabledFocus = document.activeElement.id;
      render({ hasTrack: false });
      return { observations, outsideFocus, disabledFocus, empty: document.getElementById('play') === null };
    })()`);
    for (const { expected, actual } of result.observations) assert.equal(actual, expected, `${expected} retains focus after playback update`);
    assert.equal(result.outsideFocus, "hide", "An update must not steal focus from Hide");
    assert.notEqual(result.disabledFocus, "skip", "A disabled control must not be refocused");
    assert.equal(result.empty, true);
    passed = true;
    console.log("PASS: actual mini-player DOM preserves keyboard focus across playback updates without focusing disabled controls or stealing Hide focus");
  } catch (error) { console.error(error); }
  finally { window?.destroy(); app.exit(passed ? 0 : 1); }
});
