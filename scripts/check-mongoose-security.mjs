import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);

// Each hostile path runs in a disposable process: a vulnerable dependency must
// not pollute the test runner itself before the assertion can report the bug.
for (const path of ["__proto__.haykasaProbe", "constructor.prototype.haykasaProbe", "hasOwnProperty.__proto__.haykasaProbe"]) {
  test(`virtual path cannot modify shared prototypes: ${path}`, () => {
    const source = `
      const assert = require('node:assert/strict');
      const mongoose = require(${JSON.stringify(require.resolve("mongoose"))});
      const schema = new mongoose.Schema({});
      try { schema.virtual(${JSON.stringify(path)}); } catch { /* Rejection is acceptable. */ }
      assert.equal(Object.hasOwn(Object.prototype, 'haykasaProbe'), false);
      assert.equal(Object.hasOwn(Function.prototype, 'haykasaProbe'), false);
    `;
    const result = spawnSync(process.execPath, ["-e", source], { encoding: "utf8", timeout: 10000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
  });
}

test("installed ODM still validates actual playlist items and user fields without a database", async () => {
  const { default: Playlist } = await import("../src/models/Playlist.js");
  const { default: User } = await import("../src/models/User.js");
  const playlist = new Playlist({ name: "Favorites", items: [{ entryId: "entry-1", id: "abcdefghijk" }] });
  assert.equal(playlist.validateSync(), undefined);
  playlist.items.push({ entryId: "entry-1", id: "abcdefghijk" });
  assert.ok(playlist.validateSync()?.errors.items, "Duplicate occurrence IDs must remain invalid");
  const user = new User({ userName: " Listener ", email: " LISTENER@EXAMPLE.COM " });
  assert.equal(user.validateSync(), undefined);
  assert.equal(user.userName, "Listener");
  assert.equal(user.email, "listener@example.com");
  user.sessionVersion = -1;
  assert.ok(user.validateSync()?.errors.sessionVersion);
});
