import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { desktopNpmInvocation, waitForHttp } from "../scripts/desktop-dev-lib.mjs";

test("desktop dev launches npm through Node with paths containing spaces", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "desktop npm "));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const cli = path.join(dir, "npm cli.cjs");
  await writeFile(cli, "process.stdout.write(JSON.stringify(process.argv.slice(2)));");
  const { command, args } = desktopNpmInvocation(cli);
  const child = spawn(command, args);
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  const code = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(output), ["--prefix", "desktop", "start"]);
});

test("direct desktop dev invocation explains how to supply the npm CLI", () => {
  assert.throws(() => desktopNpmInvocation(""), /npm run desktop:dev/);
});

test("desktop dev readiness waits for a successful local HTTP response", async (t) => {
  let requests = 0;
  const server = http.createServer((_request, response) => {
    requests += 1;
    response.statusCode = requests < 2 ? 503 : 200;
    response.end("ok");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  await waitForHttp(`http://127.0.0.1:${address.port}`, {
    timeoutMs: 2000,
    intervalMs: 25,
  });
  assert.ok(requests >= 2);
});

test("desktop dev readiness times out instead of hanging forever", async () => {
  await assert.rejects(
    waitForHttp("http://127.0.0.1:1", { timeoutMs: 100, intervalMs: 20 }),
    /did not become ready/,
  );
});
