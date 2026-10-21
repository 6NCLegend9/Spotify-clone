import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const cwd = fileURLToPath(new URL("../android/", import.meta.url));
const windows = process.platform === "win32";
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--bundle")) {
  console.error("Usage: node scripts/android-build.mjs [--bundle]");
  process.exit(1);
}
const task = args[0] === "--bundle" ? "bundleRelease" : "assembleDebug";
const child = spawn(windows ? "cmd.exe" : "./gradlew", windows ? ["/d", "/s", "/c", `gradlew.bat ${task}`] : [task], { cwd, stdio: "inherit" });
child.on("error", () => { console.error("Android build could not start. Install JDK 21 and Android SDK 36; see android/README.md."); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
