import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { normalizeEmail, validateEmail } from "../src/utils/authErrors.js";
import { getResetPasswordTemplate } from "../src/emails/ResetPasswordEmail.js";
import { getVerificationEmailTemplate } from "../src/emails/VerificationEmail.js";

const require = createRequire(import.meta.url);
const nodemailer = require("nodemailer");
const compiled = ts.transpileModule(readFileSync(new URL("../src/utils/mailSender.js", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;

// Compile the actual app sender with the installed SDK. Only its SMTP transport
// is replaced: stream delivery serializes real MIME/envelopes without a network.
function sender({ fail = false, configured = true } = {}) {
  const calls = [], logs = [], loaded = { exports: {} };
  const sdk = { createTransport(options) {
    calls.push(options);
    return nodemailer.createTransport(fail ? {
      name: "local-qa", version: "1", send(_mail, callback) { callback(new Error("LOCAL_PRIVATE_SMTP_DETAIL")); },
    } : { streamTransport: true, buffer: true, newline: "unix" });
  } };
  const environment = { MAIL_HOST: configured ? "smtp.example.invalid" : "", MAIL_USER: "sender@example.invalid", MAIL_PASS: "local-qa-password", MAIL_PORT: "465" };
  new Function("require", "module", "exports", "process", "console", compiled)(name => {
    assert.equal(name, "nodemailer");
    return sdk;
  }, loaded, loaded.exports, { env: environment }, { error: message => logs.push(message) });
  return { send: loaded.exports.default, calls, logs };
}

const assets = { logoUrl: "https://example.invalid/logo.png", lightPillarUrl: "https://example.invalid/background.png" };
for (const kind of ["verify", "reset"]) {
  test(`actual ${kind} email template and sender serialize with the patched SDK`, async () => {
    const url = `https://example.invalid/${kind}/LOCAL_QA_TOKEN`;
    const html = kind === "verify" ? getVerificationEmailTemplate("QA <listener>", url, assets) : getResetPasswordTemplate(url, assets);
    const { send, calls } = sender();
    const recipient = normalizeEmail("  Qa+music@Example.Invalid  ");
    assert.equal(validateEmail(recipient), null);
    const result = await send(recipient, kind === "verify" ? "Verify your HayKasa email" : "Reset your HayKasa password", html);
    assert.deepEqual(result.envelope.to, ["qa+music@example.invalid"]);
    assert.equal(result.envelope.from, "sender@example.invalid");
    const message = result.message.toString("utf8");
    assert.match(message, /From: HayKasa <sender@example\.invalid>/);
    assert.match(message, /multipart\/alternative/);
    assert.match(message, /text\/plain/);
    assert.match(message, /text\/html/);
    assert.match(message, /LOCAL_QA_TOKEN/);
    assert(!html.includes("QA <listener>"), "verification name is HTML escaped");
    assert.equal(calls[0].secure, true);
    assert.equal(calls[0].connectionTimeout, 10_000);
    assert.equal(calls[0].socketTimeout, 15_000);
  });
}

test("authentication validation rejects advisory address spellings and header/multiple-recipient injection", () => {
  for (const address of ['<"a@evil.example>"@good.example>', '"a@evil.example>"@good.example',
    "qa@example.invalid\r\nBcc: other@example.invalid", "qa@example.invalid,other@example.invalid",
    "QA <qa@example.invalid>", "qa@example.invalid (other@example.invalid)", "qa@[127.0.0.1]", ""]) {
    assert(validateEmail(address), `must reject ${JSON.stringify(address)}`);
  }
});

test("patched SDK keeps quoted local-part angle brackets from changing the delivery domain", async () => {
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const result = await transport.sendMail({ from: "sender@example.invalid", to: '<"a@evil.example>"@good.example>', text: "Local parser regression" });
  assert.equal(result.envelope.to.length, 1);
  assert(result.envelope.to[0].endsWith("@good.example"));
});

test("delivery failures expose a stable app error without SMTP details", async () => {
  const { send, logs } = sender({ fail: true });
  await assert.rejects(send("qa@example.invalid", "QA", "<p>Local test</p>"), { message: "Email delivery failed." });
  assert.deepEqual(logs, ["Email delivery failed."]);
});

test("missing delivery configuration fails before creating any transport", async () => {
  const { send, calls } = sender({ configured: false });
  await assert.rejects(send("qa@example.invalid", "QA", "<p>Local test</p>"), { message: "Email delivery failed." });
  assert.equal(calls.length, 0);
});
