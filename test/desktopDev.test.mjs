import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { waitForHttp } from "../scripts/desktop-dev-lib.mjs";

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
