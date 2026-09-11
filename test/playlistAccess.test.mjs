import assert from "node:assert/strict";
import test from "node:test";
import { canEditPlaylist, canViewPlaylist, libraryPlaylistFilter } from "../src/utils/playlistAccess.mjs";
import { serializePlaylist } from "../src/utils/playlistThemes.js";

test("public-to-private playlist changes revoke reader access but preserve owner and collaborators", () => {
  const playlist = { _id: "playlist", user: "owner", collaborators: [{ _id: "collaborator" }], visibility: "public" };
  assert.equal(canViewPlaylist(playlist, null), true);
  assert.equal(canViewPlaylist(playlist, "old-liker"), true);
  assert.equal(canEditPlaylist(playlist, "old-liker"), false);
  playlist.visibility = "private";
  assert.equal(canViewPlaylist(playlist, "old-liker"), false);
  assert.equal(canViewPlaylist(playlist, null), false);
  assert.equal(canViewPlaylist(playlist, "owner"), true);
  assert.equal(canEditPlaylist(playlist, { _id: "collaborator" }), true);
  playlist.collaborators = [];
  assert.equal(canViewPlaylist(playlist, "collaborator"), false);
  assert.equal(canEditPlaylist({}, null), false);
});

test("library membership cannot grant access to private liked playlists", () => {
  assert.deepEqual(libraryPlaylistFilter("reader", ["previously-public"]), {
    $or: [{ user: "reader" }, { collaborators: "reader" },
      { _id: { $in: ["previously-public"] }, visibility: "public" }],
  });
  assert.deepEqual(libraryPlaylistFilter(null, ["private"]), { _id: { $in: [] } });
});

test("playlist responses contain only the public contract, not model or account secrets", () => {
  const result = serializePlaylist({
    _id: "playlist", name: "My playlist", songs: ["abcdefghijk"], songAddedAt: {},
    user: { _id: "owner", userName: "Owner", imageUrl: "/avatar.png", email: "private@example.test", password: "secret" },
    collaborators: [{ _id: "collaborator", userName: "Collaborator", email: "other@example.test" }],
    visibility: "public", likedBy: ["reader"], category: "Chill", internalNotes: "not public", __v: 99,
  }, "reader");
  assert.equal(result.internalNotes, undefined);
  assert.equal(result.__v, undefined);
  assert.equal(result.likedBy, undefined);
  assert.equal(result.user.email, undefined);
  assert.equal(result.user.password, undefined);
  assert.equal(result.collaborators[0].email, undefined);
  assert.equal(result.likesCount, 1);
  assert.equal(result.liked, true);
  assert.deepEqual(result.songs, ["abcdefghijk"]);
});