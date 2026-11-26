import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getManifest } from "@serwist/build";

test("precache traversal includes nested assets, excludes private files and revises changed content", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "haykasa-precache-"));
  try {
    await fs.mkdir(path.join(directory, "assets", "nested"), { recursive: true });
    await fs.mkdir(path.join(directory, "private"));
    await fs.writeFile(path.join(directory, "assets", "app.js"), "first");
    await fs.writeFile(path.join(directory, "assets", "nested", "theme.css"), "body{}");
    await fs.writeFile(path.join(directory, "private", "session.json"), "{}");
    await fs.writeFile(path.join(directory, "assets", "app.js.map"), "{}");
    const options = { globDirectory: directory, globPatterns: ["**/*.{js,css,json}"], globIgnores: ["private/**", "**/*.map"] };
    const first = await getManifest(options);
    assert.deepEqual(first.warnings, []);
    assert.deepEqual(first.manifestEntries.map(entry => entry.url).sort(), ["assets/app.js", "assets/nested/theme.css"]);
    assert.equal(first.count, 2);
    await fs.writeFile(path.join(directory, "assets", "app.js"), "second");
    const second = await getManifest(options);
    const revision = (result, url) => result.manifestEntries.find(entry => entry.url === url).revision;
    assert.notEqual(revision(first, "assets/app.js"), revision(second, "assets/app.js"));
    assert.equal(revision(first, "assets/nested/theme.css"), revision(second, "assets/nested/theme.css"));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
