import assert from "node:assert/strict";
import test from "node:test";
import {
  desktopBlobBaseUrl,
  desktopReleaseFileUrl,
  desktopStableManifestUrl,
  normalizeDesktopReleaseChannel,
} from "../src/utils/desktopRelease.mjs";

test("desktop release URLs are restricted to public Vercel Blob storage", () => {
  assert.equal(
    desktopReleaseFileUrl(
      "https://abc123.public.blob.vercel-storage.com/desktop",
      "stable",
      "latest.yml",
    ),
    "https://abc123.public.blob.vercel-storage.com/desktop/stable/latest.yml",
  );
  assert.equal(
    desktopStableManifestUrl("https://abc123.public.blob.vercel-storage.com/desktop"),
    "https://abc123.public.blob.vercel-storage.com/desktop/stable/release-manifest.json",
  );
  assert.equal(desktopReleaseFileUrl("https://not-blob.example.com", "stable", "latest.yml"), "");
  assert.equal(desktopReleaseFileUrl("https://abc123.public.blob.vercel-storage.com", "stable", "../latest.yml"), "");
});

test("desktop release channel and Blob base validation reject unsafe values", () => {
  assert.equal(normalizeDesktopReleaseChannel("stable"), "stable");
  assert.equal(normalizeDesktopReleaseChannel("internal"), "internal");
  assert.equal(normalizeDesktopReleaseChannel("unknown"), "");
  assert.equal(desktopBlobBaseUrl("https://abc123.public.blob.vercel-storage.com/desktop/"), "https://abc123.public.blob.vercel-storage.com/desktop");
  assert.equal(desktopBlobBaseUrl("https://user:pass@abc123.public.blob.vercel-storage.com"), "");
  assert.equal(desktopBlobBaseUrl("http://abc123.public.blob.vercel-storage.com"), "");
});
