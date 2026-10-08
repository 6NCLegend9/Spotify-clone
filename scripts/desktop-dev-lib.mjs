export function desktopNpmInvocation(npmCli = process.env.npm_execpath) {
  if (!npmCli) throw new Error("Start the desktop development app with npm run desktop:dev.");
  // Node 22 cannot spawn npm.cmd directly on Windows. Running npm's JS CLI
  // through Node also preserves paths with spaces without enabling a shell.
  return { command: process.execPath, args: [npmCli, "--prefix", "desktop", "start"] };
}

export async function waitForHttp(url, {
  timeoutMs = 90_000,
  intervalMs = 250,
  fetchImpl = fetch,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetchImpl(url, { cache: "no-store" });
      await response.body?.cancel();
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`HayKasa web renderer did not become ready at ${url}.`);
}

export function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    child.kill();
    return;
  }
  child.kill("SIGTERM");
}
