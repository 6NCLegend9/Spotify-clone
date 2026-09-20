import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { ApiRouteError } from "../src/utils/apiResponseCore.mjs";

register("./support/crowd-radio-loader.mjs", import.meta.url);

const hostId = "aaaaaaaaaaaaaaaaaaaaaaaa";
const fixtures = globalThis.__crowdRadioFixtures = {
  limited: false,
  searches: 0,
  member: true,
  room: true,
  account: async () => {
    if (!fixtures.authorized) throw new ApiRouteError("UNAUTHORIZED");
    return { email: "host@example.test", user: { _id: hostId } };
  },
  JamRoom: {
    findOne(filter) {
      fixtures.filter = filter;
      const found = fixtures.room && fixtures.member
        ? { _id: "room" }
        : null;
      return { select() { return this; }, lean: async () => found };
    },
  },
  youtubeFetch: async () => ({
    ok: true,
    status: 200,
    data: {
      items: [{
        id: { videoId: "abcdefghijk" },
        snippet: { title: "Crowd track", channelTitle: "Artist", thumbnails: {} },
      }],
    },
  }),
};

const { POST } = await import("../src/app/api/crowd-radio/route.js");

function request(body) {
  return new Request("http://localhost/api/crowd-radio", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const seeds = [{ term: "Pop", kind: "genre", owners: [hostId], ownerNames: ["Host"] }];

beforeEach(() => {
  fixtures.limited = false;
  fixtures.searches = 0;
  fixtures.member = true;
  fixtures.room = true;
  fixtures.authorized = true;
  fixtures.filter = null;
});

test("crowd radio refuses strangers without spending YouTube quota", async () => {
  fixtures.member = false;
  const response = await POST(request({ code: "ABCDEF", seeds }));
  assert.equal(response.status, 404);
  assert.equal(fixtures.searches, 0);
  assert.equal(fixtures.filter.members, hostId);
});

test("crowd radio serves a member of a live room", async () => {
  const response = await POST(request({ code: "ABCDEF", seeds }));
  assert.equal(response.status, 200);
  assert.equal(fixtures.searches, 1);
  const body = await response.json();
  assert.equal(body.tracks[0].id, "abcdefghijk");
});
