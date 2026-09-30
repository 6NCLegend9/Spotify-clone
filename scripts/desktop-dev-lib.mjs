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
