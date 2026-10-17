import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const cwd = fileURLToPath(new URL("../android/", import.meta.url));
const windows = process.platform === "win32";
const child = spawn(windows ? "cmd.exe" : "./gradlew", windows ? ["/d", "/s", "/c", "gradlew.bat assembleDebug"] : ["assembleDebug"], { cwd, stdio: "inherit" });
child.on("error", () => { console.error("Android build could not start. Install JDK 21 and Android SDK 36; see android/README.md."); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
