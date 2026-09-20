import assert from "node:assert/strict";
import test from "node:test";
import Playlist from "../src/models/Playlist.js";
import User from "../src/models/User.js";
import UserData from "../src/models/UserData.js";

function hasIndex(schema, spec, options = {}) {
  return schema.indexes().some(([fields, indexOptions]) => (
    Object.keys(spec).length === Object.keys(fields).length
    && Object.entries(spec).every(([key, value]) => fields[key] === value)
    && Object.entries(options).every(([key, value]) => indexOptions[key] === value)
  ));
}

test("playlist library $or queries use owner and collaborator indexes", () => {
  assert.ok(hasIndex(Playlist.schema, { user: 1, updatedAt: -1 }));
  assert.ok(hasIndex(Playlist.schema, { collaborators: 1 }));
});

test("password reset and email verify look up hashed tokens with sparse indexes", () => {
  assert.ok(hasIndex(User.schema, { resetPasswordToken: 1 }, { sparse: true }));
  assert.ok(hasIndex(User.schema, { verificationToken: 1 }, { sparse: true }));
});

test("playlist delete and account delete can match UserData membership arrays", () => {
  assert.ok(hasIndex(UserData.schema, { playlists: 1 }));
  assert.ok(hasIndex(UserData.schema, { likedPlaylists: 1 }));
});
