import assert from "node:assert/strict";
import test from "node:test";
import {
  DesktopPolicy,
  installationEligibleForRollout,
  installationRolloutBucket,
  sanitizeDesktopPolicy,
} from "../src/policy.mjs";

test("desktop policy keeps safe defaults and honors kill switches", () => {
  assert.equal(sanitizeDesktopPolicy(null), null);
  const policy = sanitizeDesktopPolicy({
    formatVersion: 1,
    maintenance: false,
    maintenanceMessage: "  planned\nmessage ",
    updateRolloutPercent: 25.4,
    features: { auth: false, discord: true, updater: false },
  });
  assert.deepEqual(policy, {
    formatVersion: 1,
    maintenance: false,
    maintenanceMessage: "planned message",
    updateRolloutPercent: 25,
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
        updateRolloutPercent: 50,
        features: { auth: true, discord: false, updater: true },
      }), { status: 200 });
    },
  });

  await client.refresh();
  assert.equal(client.feature("discord"), false);
  assert.equal(client.snapshot().updateRolloutPercent, 50);
  available = false;
  await client.refresh();
  assert.equal(client.feature("discord"), false);
  assert.equal(client.feature("auth"), true);
  assert.equal(client.snapshot().updateRolloutPercent, 50);
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

test("installation rollout bucket is stable and respects percentage boundaries", () => {
  const installationId = "550e8400-e29b-41d4-a716-446655440000";
  const bucket = installationRolloutBucket(installationId);
  assert.ok(bucket >= 0 && bucket <= 99);
  assert.equal(installationRolloutBucket(installationId), bucket);
  assert.equal(installationEligibleForRollout(installationId, 100), true);
  assert.equal(installationEligibleForRollout(installationId, 0), false);
  assert.equal(installationEligibleForRollout(installationId, bucket), false);
  assert.equal(installationEligibleForRollout(installationId, bucket + 1), true);
});
