import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Presence is all this preflight can establish. The build must still verify
// Authenticode and the published bundle must pass production HMAC verification.
export function checkReleaseConfiguration(channel, env = process.env) {
  if (!["internal", "beta", "stable"].includes(channel)) throw new Error("Invalid desktop release channel.");
  if (channel === "internal") return { ready: true, missing: [], invalid: [] };
  const values = {
    HEYKASA_WINDOWS_CSC_LINK: env.CSC_LINK || env.HEYKASA_WINDOWS_CSC_LINK,
    HEYKASA_WINDOWS_CSC_PASSWORD: env.CSC_KEY_PASSWORD || env.HEYKASA_WINDOWS_CSC_PASSWORD,
    HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET: env.HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET,
  };
  const missing = Object.keys(values).filter(name => !String(values[name] || "").trim());
  const key = String(values.HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET || "");
  const invalid = key.trim() && (key.length < 32 || key !== key.trim()) ? ["HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET"] : [];
  return { ready: missing.length === 0 && invalid.length === 0, missing, invalid };
}

function main() {
  const channel = process.env.HEYKASA_DESKTOP_RELEASE_CHANNEL || "stable";
  const automatic = process.argv.includes("--automatic") && process.env.GITHUB_EVENT_NAME === "push";
  const result = checkReleaseConfiguration(channel);
  const title = !result.ready && automatic ? "Automatic desktop release skipped" : "Desktop release configuration";
  const lines = [`## ${title}`, "", `Channel: ${channel}.`];
  if (channel === "internal") {
    lines.push("Unsigned internal build: signing credentials are not required. This does not enable stable automatic updates.");
  } else if (result.ready) {
    lines.push("Required signing inputs are present. Certificate validity and production manifest trust still require verification.");
  } else {
    lines.push(automatic
      ? "Automatic publication skipped: signing configuration is incomplete. No installer was built or published; installed apps will not receive a new signed update."
      : "Publication blocked: signing configuration is incomplete. No signed installer can be released.", "");
    for (const name of result.missing) lines.push(`- Missing: ${name}`);
    for (const name of result.invalid) lines.push(`- Invalid: ${name} must contain at least 32 characters with no leading or trailing whitespace.`);
    lines.push("", "Set these secrets in the protected GitHub desktop-release environment. Configure the same manifest HMAC key in production Vercel; do not paste secret values into logs or issues.", "See desktop/README.md#release-configuration-check for setup and recovery.");
  }
  // Only fixed messages and secret names are logged, never credential values.
  console.log(lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `ready=${result.ready}\n`);
  if (!result.ready && automatic) console.log("::notice::Automatic desktop release skipped: configure the protected signing secrets to enable signed updates.");
  if (!result.ready && !automatic) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
