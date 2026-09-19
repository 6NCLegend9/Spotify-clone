import assert from "node:assert/strict";
import test from "node:test";
import {
  LOCAL_DEV_APP_URL,
  PRODUCTION_APP_URL,
  desktopAppUrl,
} from "../src/config.mjs";

test("unpackaged desktop loads the local HayKasa origin by default", () => {
  assert.equal(desktopAppUrl({ isPackaged: false }), LOCAL_DEV_APP_URL);
  assert.equal(desktopAppUrl({ isPackaged: false, overrideUrl: "" }), "http://localhost:3003");
});

test("unpackaged desktop may override to another loopback origin", () => {
  assert.equal(
    desktopAppUrl({ isPackaged: false, overrideUrl: "http://127.0.0.1:3000/" }),
    "http://127.0.0.1:3000",
  );
});

test("unpackaged desktop ignores non-loopback overrides", () => {
  assert.equal(
    desktopAppUrl({ isPackaged: false, overrideUrl: "https://evil.example" }),
    LOCAL_DEV_APP_URL,
  );
});

test("packaged desktop always uses the production origin", () => {
  assert.equal(desktopAppUrl({ isPackaged: true }), PRODUCTION_APP_URL);
  assert.equal(
    desktopAppUrl({ isPackaged: true, overrideUrl: "http://localhost:3003" }),
    PRODUCTION_APP_URL,
  );
});
