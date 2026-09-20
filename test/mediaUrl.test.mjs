import assert from "node:assert/strict";
import test from "node:test";
import { allowlistedMediaUrl } from "../src/utils/mediaUrl.mjs";

test("stored artwork URLs allow only HTTPS YouTube and Google hosts", () => {
  assert.equal(
    allowlistedMediaUrl("https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg"),
    "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg",
  );
  assert.equal(
    allowlistedMediaUrl("https://yt3.ggpht.com/a/avatar"),
    "https://yt3.ggpht.com/a/avatar",
  );
  assert.equal(allowlistedMediaUrl("https://images.unsplash.com/photo-x"), "");
  assert.equal(allowlistedMediaUrl("https://avatars.githubusercontent.com/u/1"), "");
  assert.equal(allowlistedMediaUrl("http://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg"), "");
  assert.equal(allowlistedMediaUrl("https://user:pass@i.ytimg.com/vi/abcdefghijk/hqdefault.jpg"), "");
  assert.equal(allowlistedMediaUrl("https://i.ytimg.com.evil.example/image.jpg"), "");
  assert.equal(allowlistedMediaUrl(""), "");
});
