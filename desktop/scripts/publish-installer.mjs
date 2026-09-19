import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { put } from "@vercel/blob";
import {
  DESKTOP_INSTALLER_PUBLIC_NAME,
  findLocalDesktopInstaller,
} from "../../src/utils/desktopInstaller.mjs";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const installer = findLocalDesktopInstaller(path.resolve(desktopRoot, ".."));
if (!installer) {
  throw new Error("Build the Windows installer first with npm run dist in desktop/.");
}

const token = String(process.env.BLOB_READ_WRITE_TOKEN || "").trim();
if (!token) {
  throw new Error("BLOB_READ_WRITE_TOKEN is required to publish the installer to Vercel Blob.");
}

const remoteName = `desktop/stable/${DESKTOP_INSTALLER_PUBLIC_NAME}`;
const uploaded = await put(remoteName, fs.createReadStream(installer.filePath), {
  access: "public",
  addRandomSuffix: false,
  allowOverwrite: true,
  cacheControlMaxAge: 60,
  contentDisposition: `attachment; filename="${DESKTOP_INSTALLER_PUBLIC_NAME}"`,
  contentType: "application/octet-stream",
  token,
});
const installerUrl = uploaded.downloadUrl || uploaded.url;
const published = await fetch(installerUrl, { method: "HEAD", redirect: "follow" });
if (!published.ok) {
  throw new Error(`Published installer returned ${published.status}: ${installerUrl}`);
}

const blobUrl = new URL(uploaded.url);
const suffix = `/stable/${DESKTOP_INSTALLER_PUBLIC_NAME}`;
if (!blobUrl.pathname.endsWith(suffix) && !blobUrl.pathname.endsWith(encodeURI(suffix))) {
  throw new Error("Could not derive the Vercel Blob base URL from the uploaded installer.");
}
blobUrl.pathname = blobUrl.pathname.slice(0, blobUrl.pathname.endsWith(encodeURI(suffix))
  ? -encodeURI(suffix).length
  : -suffix.length);
const blobBaseUrl = blobUrl.href.replace(/\/$/, "");

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `installer_url=${installerUrl}\nblob_base_url=${blobBaseUrl}\n`,
    "utf8",
  );
}

console.log(JSON.stringify({
  event: "desktop_installer_published",
  installerUrl,
  blobBaseUrl,
  sizeBytes: installer.sizeBytes,
}));
