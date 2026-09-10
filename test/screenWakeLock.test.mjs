import assert from "node:assert/strict";
import test from "node:test";
import { createScreenWakeLock } from "../src/utils/screenWakeLock.mjs";

function makeSentinel() {
  const sentinel = new EventTarget();
  sentinel.released = false;
  sentinel.release = async () => {
    sentinel.released = true;
    sentinel.dispatchEvent(new Event("release"));
  };
  return sentinel;
}

test("permission resolving after disposal immediately releases the screen lock", async () => {
  let grantPermission;
  const sentinel = makeSentinel();
  const lock = createScreenWakeLock({
    request: () => new Promise((resolve) => { grantPermission = resolve; }),
  }, () => true);
  const pending = lock.acquire();
  lock.dispose();
  grantPermission(sentinel);
  await pending;
  assert.equal(sentinel.released, true);
});

test("concurrent acquisition is deduplicated and OS release allows reacquisition", async () => {
  let requests = 0;
  const sentinels = [];
  const lock = createScreenWakeLock({
    request: async () => {
      requests += 1;
      const sentinel = makeSentinel();
      sentinels.push(sentinel);
      return sentinel;
    },
  }, () => true);
  await Promise.all([lock.acquire(), lock.acquire()]);
  await lock.acquire();
  assert.equal(requests, 1);
  await sentinels[0].release();
  await lock.acquire();
  assert.equal(requests, 2);
  lock.dispose();
  assert.equal(sentinels[1].released, true);
  await lock.acquire();
  assert.equal(requests, 2);
});

test("hidden pages do not request locks and release late permission grants", async () => {
  let visible = false;
  let requests = 0;
  let grantPermission;
  const sentinel = makeSentinel();
  const lock = createScreenWakeLock({
    request: () => {
      requests += 1;
      return new Promise((resolve) => { grantPermission = resolve; });
    },
  }, () => visible);
  await lock.acquire();
  assert.equal(requests, 0);
  visible = true;
  const pending = lock.acquire();
  visible = false;
  grantPermission(sentinel);
  await pending;
  assert.equal(sentinel.released, true);
  lock.dispose();
});

test("permission denial is nonfatal and can be retried", async () => {
  const sentinel = makeSentinel();
  let requests = 0;
  const lock = createScreenWakeLock({
    request: async () => {
      if (++requests === 1) throw new Error("Permission denied");
      return sentinel;
    },
  }, () => true);
  await lock.acquire();
  await lock.acquire();
  assert.equal(requests, 2);
  lock.dispose();
  assert.equal(sentinel.released, true);
});