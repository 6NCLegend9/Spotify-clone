import { spawn } from "node:child_process";
import { stopChild, waitForHttp } from "./desktop-dev-lib.mjs";

const port = 3003;
const origin = `http://127.0.0.1:${port}`;
let web;
let desktop;
let closing = false;

const close = () => {
  if (closing) return;
  closing = true;
  stopChild(desktop);
  stopChild(web);
};

process.on("SIGINT", close);
process.on("SIGTERM", close);
process.on("exit", close);

web = spawn(process.execPath, [
  "node_modules/next/dist/bin/next",
  "dev",
  "--turbopack",
  "--hostname",
  "127.0.0.1",
  "--port",
  String(port),
], { stdio: "inherit", env: process.env });

try {
  await waitForHttp(origin);
  desktop = spawn(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["--prefix", "desktop", "start"],
    {
      stdio: "inherit",
      env: { ...process.env, HEYKASA_DESKTOP_URL: origin },
    },
  );
  const code = await new Promise((resolve, reject) => {
    desktop.once("error", reject);
    desktop.once("exit", resolve);
  });
  process.exitCode = Number.isInteger(code) ? code : 1;
} finally {
  close();
}
