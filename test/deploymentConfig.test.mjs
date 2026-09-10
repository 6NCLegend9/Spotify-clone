import assert from "node:assert/strict";
import test from "node:test";
import { validateDeploymentConfig } from "../src/utils/deploymentConfig.mjs";

const valid = {
  NEXTAUTH_URL: "https://music.example.test",
  NEXT_PUBLIC_APP_URL: "https://music.example.test/",
  NEXTAUTH_SECRET: "a".repeat(32), RATE_LIMIT_SECRET: "b".repeat(32),
  MONGODB_URI: "mongodb://localhost/test", MAIL_HOST: "smtp.example.test",
  MAIL_USER: "sender@example.test", MAIL_PASS: "test-only-password",
};

test("valid configuration permits absent optional integrations", () => {
  const result = validateDeploymentConfig(valid);
  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.length, 3);
});

test("preflight rejects mismatched origins, invalid ports and partial integration pairs", () => {
  const result = validateDeploymentConfig({ ...valid, NEXTAUTH_URL: "https://other.example.test", MAIL_PORT: "0", GOOGLE_CLIENT_ID: "configured" });
  assert.equal(result.errors.length, 3);
});

test("errors do not expose secret values or URL credentials", () => {
  const result = validateDeploymentConfig({ ...valid, NEXTAUTH_URL: "https://sensitive:password@example.test", NEXTAUTH_SECRET: "short-secret" });
  const text = JSON.stringify(result);
  assert.ok(result.errors.length >= 2);
  for (const secret of ["sensitive", "password", "short-secret"]) assert.equal(text.includes(secret), false);
});