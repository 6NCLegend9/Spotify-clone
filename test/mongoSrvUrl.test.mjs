import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStandardMongoUrl,
  mongoSrvDnsServers,
} from "../src/utils/mongoSrvUrl.mjs";

test("ignores loopback DNS stubs for MongoDB SRV lookups", () => {
  assert.deepEqual(mongoSrvDnsServers(["127.0.0.1", "::1"]), [
    "8.8.8.8",
    "1.1.1.1",
  ]);
});

test("builds a standard Atlas url from SRV parts", () => {
  const url = buildStandardMongoUrl({
    username: "user",
    password: "p@ss",
    hosts: "a.mongodb.net:27017,b.mongodb.net:27017",
    pathname: "/",
    search: "retryWrites=true",
    txt: "authSource=admin&replicaSet=atlas-x",
  });

  assert.equal(
    url.startsWith("mongodb://user:p%40ss@a.mongodb.net:27017,b.mongodb.net:27017/"),
    true,
  );
  assert.match(url, /tls=true/);
  assert.match(url, /authSource=admin/);
  assert.match(url, /replicaSet=atlas-x/);
  assert.match(url, /retryWrites=true/);
});
