import assert from "node:assert/strict";
import test from "node:test";
import { DesktopPolicy, sanitizeDesktopPolicy } from "../src/policy.mjs";

test("desktop policy keeps safe defaults and honors kill switches", () => {
  assert.equal(sanitizeDesktopPolicy(null), null);
  const policy = sanitizeDesktopPolicy({
    formatVersion: 1,
    maintenance: false,
    maintenanceMessage: "  planned\nmessage ",
    features: { auth: false, discord: true, updater: false },
  });
  assert.deepEqual(policy, {
    formatVersion: 1,
    maintenance: false,
    maintenanceMessage: "planned message",
    features: { auth: false, discord: true, updater: false },
  });
});

test("policy refresh retains the last valid kill switch during an outage", async () => {
  let available = true;
  const client = new DesktopPolicy({
    url: "https://haykasa.vercel.app/api/desktop/policy",
    fetchImpl: async () => {
      if (!available) throw new Error("offline");
      return new Response(JSON.stringify({
        formatVersion: 1,
        maintenance: false,
        features: { auth: true, discord: false, updater: true },
      }), { status: 200 });
    },
  });

  await client.refresh();
  assert.equal(client.feature("discord"), false);
  available = false;
  await client.refresh();
  assert.equal(client.feature("discord"), false);
  assert.equal(client.feature("auth"), true);
  client.dispose();
});

test("maintenance mode disables every privileged capability", async () => {
  const client = new DesktopPolicy({
    url: "https://haykasa.vercel.app/api/desktop/policy",
    fetchImpl: async () => new Response(JSON.stringify({
      formatVersion: 1,
      maintenance: true,
      maintenanceMessage: "Desktop maintenance",
      features: { auth: true, discord: true, updater: true },
    }), { status: 200 }),
  });
  await client.refresh();
  assert.equal(client.feature("auth"), false);
  assert.equal(client.feature("discord"), false);
  assert.equal(client.feature("updater"), false);
  client.dispose();
});
