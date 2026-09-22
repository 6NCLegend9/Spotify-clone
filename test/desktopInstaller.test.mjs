import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  DESKTOP_INSTALLER_APP_PATH,
  DESKTOP_INSTALLER_GITHUB_FALLBACK,
  DESKTOP_INSTALLER_PUBLIC_NAME,
  desktopAppDownloadUrl,
  findLocalDesktopInstaller,
  hostedDesktopInstallerUrl,
} from "../src/utils/desktopInstaller.mjs";

test("desktop app download URL allows the local installer route and HTTPS installers", () => {
  assert.equal(desktopAppDownloadUrl(DESKTOP_INSTALLER_APP_PATH), DESKTOP_INSTALLER_APP_PATH);
  assert.equal(
    desktopAppDownloadUrl("https://downloads.example.com/HayKasa-Setup-1.0.0-x64.exe"),
    "https://downloads.example.com/HayKasa-Setup-1.0.0-x64.exe",
  );
  assert.equal(desktopAppDownloadUrl("/tmp/HayKasa-Setup-x64.exe"), "");
  assert.equal(desktopAppDownloadUrl("https://user:pass@evil.example/HayKasa-Setup-x64.exe"), "");
});

test("hosted installer URL prefers a public HTTPS exe and otherwise uses Vercel Blob", () => {
  assert.equal(
    hostedDesktopInstallerUrl("https://downloads.example.com/HayKasa-Setup-x64.exe"),
    "https://downloads.example.com/HayKasa-Setup-x64.exe",
  );
  assert.equal(hostedDesktopInstallerUrl("https://downloads.example.com/HayKasa.zip"), DESKTOP_INSTALLER_GITHUB_FALLBACK);
  assert.equal(hostedDesktopInstallerUrl(""), DESKTOP_INSTALLER_GITHUB_FALLBACK);
  assert.equal(
    hostedDesktopInstallerUrl(
      "",
      "https://abc123.public.blob.vercel-storage.com/desktop",
    ),
    "https://abc123.public.blob.vercel-storage.com/desktop/stable/HayKasa-Setup-x64.exe",
  );
});

test("local installer lookup stays inside desktop/dist and prefers the stable Setup name", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "heykasa-installer-"));
  const distDir = path.join(cwd, "desktop", "dist");
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, "HayKasa-Setup-1.0.0-x64.exe"), "versioned");
  fs.writeFileSync(path.join(distDir, DESKTOP_INSTALLER_PUBLIC_NAME), "stable");
  fs.writeFileSync(path.join(distDir, "notes.txt"), "ignore");

  const found = findLocalDesktopInstaller(cwd);
  assert.equal(found.fileName, DESKTOP_INSTALLER_PUBLIC_NAME);
  assert.equal(found.sizeBytes, 6);

  fs.rmSync(cwd, { recursive: true, force: true });
  assert.equal(findLocalDesktopInstaller(cwd), null);
});
