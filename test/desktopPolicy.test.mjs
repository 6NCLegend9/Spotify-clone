import assert from "node:assert/strict";
import test from "node:test";

const original = {
  desktop: process.env.HEYKASA_DESKTOP_ENABLED,
  auth: process.env.HEYKASA_DESKTOP_AUTH_ENABLED,
  discord: process.env.HEYKASA_DESKTOP_DISCORD_ENABLED,
  updater: process.env.HEYKASA_DESKTOP_UPDATER_ENABLED,
  message: process.env.HEYKASA_DESKTOP_MAINTENANCE_MESSAGE,
};
const { GET } = await import("../src/app/api/desktop/policy/route.js");

function restore() {
  const values = {
    HEYKASA_DESKTOP_ENABLED: original.desktop,
    HEYKASA_DESKTOP_AUTH_ENABLED: original.auth,
    HEYKASA_DESKTOP_DISCORD_ENABLED: original.discord,
    HEYKASA_DESKTOP_UPDATER_ENABLED: original.updater,
    HEYKASA_DESKTOP_MAINTENANCE_MESSAGE: original.message,
  };
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test.afterEach(restore);

test("desktop policy defaults native capabilities on", async () => {
  delete process.env.HEYKASA_DESKTOP_ENABLED;
  delete process.env.HEYKASA_DESKTOP_AUTH_ENABLED;
  delete process.env.HEYKASA_DESKTOP_DISCORD_ENABLED;
  delete process.env.HEYKASA_DESKTOP_UPDATER_ENABLED;
  const response = await GET();
  const policy = await response.json();
  assert.equal(policy.maintenance, false);
  assert.deepEqual(policy.features, { auth: true, discord: true, updater: true });
});

test("desktop policy can remotely stop risky integrations", async () => {
  process.env.HEYKASA_DESKTOP_AUTH_ENABLED = "off";
  process.env.HEYKASA_DESKTOP_DISCORD_ENABLED = "0";
  process.env.HEYKASA_DESKTOP_UPDATER_ENABLED = "false";
  const response = await GET();
  const policy = await response.json();
  assert.deepEqual(policy.features, { auth: false, discord: false, updater: false });
});

test("desktop maintenance mode includes a bounded operator message", async () => {
  process.env.HEYKASA_DESKTOP_ENABLED = "disabled";
  process.env.HEYKASA_DESKTOP_MAINTENANCE_MESSAGE = ` maintenance\n${"x".repeat(400)} `;
  const response = await GET();
  const policy = await response.json();
  assert.equal(policy.maintenance, true);
  assert.ok(policy.maintenanceMessage.startsWith("maintenance "));
  assert.equal(policy.maintenanceMessage.length, 240);
});
