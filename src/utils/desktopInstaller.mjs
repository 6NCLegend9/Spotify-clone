import fs from "node:fs";
import path from "node:path";

export const DESKTOP_INSTALLER_APP_PATH = "/api/desktop/download";
export const DESKTOP_INSTALLER_PUBLIC_NAME = "HayKasa-Setup-x64.exe";
export const DESKTOP_INSTALLER_NOTES_URL = "";

const INSTALLER_FILE = /^HayKasa-Setup-(?:[\w.-]+-)?x64\.exe$/i;

export function desktopDistDir(cwd = process.cwd()) {
  return path.resolve(cwd, "desktop", "dist");
}

export function findLocalDesktopInstaller(cwd = process.cwd()) {
  const distDir = desktopDistDir(cwd);
  let names;
  try {
    names = fs.readdirSync(distDir);
  } catch {
    return null;
  }

  const matches = names.filter((name) => INSTALLER_FILE.test(name));
  const preferred = matches.find((name) => name === DESKTOP_INSTALLER_PUBLIC_NAME)
    || matches.find((name) => /^HayKasa-Setup-\d+\.\d+\.\d+/i.test(name))
    || matches[0];
  if (!preferred) return null;

  const filePath = path.resolve(distDir, preferred);
  const relative = path.relative(distDir, filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;

  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size <= 0) return null;
    return { filePath, fileName: preferred, sizeBytes: stat.size };
  } catch {
    return null;
  }
}

export function hostedDesktopInstallerUrl(downloadEnv) {
  const text = typeof downloadEnv === "string" ? downloadEnv.trim() : "";
  if (!text) return "";
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" || url.username || url.password || !url.pathname.toLowerCase().endsWith(".exe")) {
      return "";
    }
    return url.href;
  } catch {
    return "";
  }
}

export function desktopAppDownloadUrl(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text === DESKTOP_INSTALLER_APP_PATH) return DESKTOP_INSTALLER_APP_PATH;
  try {
    const url = new URL(text);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}
