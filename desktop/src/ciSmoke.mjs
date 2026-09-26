import fs from "node:fs";
import path from "node:path";

export const PACKAGED_CI_SMOKE_SWITCH = "--heykasa-ci-smoke";
export const PACKAGED_CI_SMOKE_RESULT_FILE = "heykasa-packaged-smoke.json";

export function isPackagedCiSmoke(argv = process.argv, env = process.env) {
  return Array.isArray(argv)
    && argv.includes(PACKAGED_CI_SMOKE_SWITCH)
    && env?.GITHUB_ACTIONS === "true";
}

export function packagedCiSmokeResultPath(tempDirectory) {
  const directory = String(tempDirectory || "").trim();
  if (!directory) throw new Error("A temporary directory is required for packaged smoke results.");
  return path.join(directory, PACKAGED_CI_SMOKE_RESULT_FILE);
}

export function writePackagedCiSmokeResult(tempDirectory, result) {
  const target = packagedCiSmokeResultPath(tempDirectory);
  fs.writeFileSync(target, `${JSON.stringify(result)}\n`, { encoding: "utf8", mode: 0o600 });
  return target;
}

export async function runPackagedCiSmoke({ app, window, trustedRenderer }) {
  let result;
  try {
    const bridge = await window.webContents.executeJavaScript(`({
      hasDesktop: typeof window.heykasaDesktop?.getInfo === "function",
      hasNodeRequire: typeof window.require !== "undefined"
    })`);
    const url = window.webContents.getURL();
    result = {
      ok: trustedRenderer === true && bridge?.hasDesktop === true && bridge?.hasNodeRequire === false,
      trustedRenderer: trustedRenderer === true,
      hasDesktopBridge: bridge?.hasDesktop === true,
      hasNodeRequire: bridge?.hasNodeRequire === true,
      url,
    };
  } catch (error) {
    result = {
      ok: false,
      trustedRenderer: false,
      hasDesktopBridge: false,
      hasNodeRequire: false,
      url: window?.webContents?.getURL?.() || "",
      error: error instanceof Error ? error.message.slice(0, 240) : "Packaged smoke failed.",
    };
  }

  writePackagedCiSmokeResult(app.getPath("temp"), result);
  app.exit(result.ok ? 0 : 1);
  return result;
}
