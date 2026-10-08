import test from "node:test";
import assert from "node:assert/strict";
import { artistPageHref, artistChannelChoices, musicReleaseHref, normalizeArtistCredits, trackArtistCredits } from "../src/utils/artistNavigation.mjs";

const PAC = "UCMIdeeBjp_60Jv7ROpRxK6Q";
const DRE = "UCbbbbbbbbbbbbbbbbbbbbbb";

test("release destinations accept playable music browse IDs and reject legacy catalog IDs", () => {
  assert.equal(musicReleaseHref("MPREb_catalog-album"), "/album/MPREb_catalog-album");
  for (const id of ["", "spotify-album", "MPR", "MPR../../private", "javascript:alert(1)", "MPR" + "a".repeat(126)]) {
    assert.equal(musicReleaseHref(id), "");
  }
});

test("artist destinations use validated identities or a safely encoded name lookup", () => {
  assert.equal(artistPageHref(PAC, "2Pac"), `/artist/${PAC}?name=2Pac`);
  assert.equal(artistPageHref("", "AC/DC & Friends"), "/artist?name=AC%2FDC%20%26%20Friends");
  assert.equal(artistPageHref("javascript:alert(1)", "2Pac"), "/artist?name=2Pac");
  assert.equal(artistPageHref("", ""), "");
});

test("structured primary and featured credits retain each artist's own identity", () => {
  assert.deepEqual(trackArtistCredits({ channel: "Uploader", channelId: "UCaaaaaaaaaaaaaaaaaaaaaa", artists: { primary: [{ name: "2Pac", id: PAC }], featured: [{ name: "Dr. Dre", channelId: DRE }] } }), [
    { name: "2Pac", channelId: PAC }, { name: "Dr. Dre", channelId: DRE },
  ]);
});

test("featured title credits are separate from an unrelated uploader", () => {
  assert.deepEqual(trackArtistCredits({ title: "$UICIDEBOY$ Ft. That Mexican OT - Texas to Louisiana (Music Video)", channel: "Trunk Bangers and TRUNK MAFIA MUSIC", channelId: PAC }), [
    { name: "$UICIDEBOY$" }, { name: "That Mexican OT" },
  ]);
  assert.deepEqual(trackArtistCredits({ title: "2Pac - California Love (feat. Dr. Dre)", channel: "2Pac - Topic", channelId: PAC }), [
    { name: "2Pac", channelId: PAC }, { name: "Dr. Dre" },
  ]);
});

test("band names stay intact and a media suffix does not become an artist", () => {
  assert.deepEqual(trackArtistCredits({ channel: "Earth, Wind & Fire", title: "September (Official Video)", channelId: PAC }), [{ name: "Earth, Wind & Fire", channelId: PAC }]);
  assert.deepEqual(trackArtistCredits({ channel: "AC/DC", title: "Thunderstruck - Official Video", channelId: PAC }), [{ name: "AC/DC", channelId: PAC }]);
  assert.deepEqual(trackArtistCredits({ artists: [{ name: "Tyler, The Creator", id: PAC }] }), [{ name: "Tyler, The Creator", channelId: PAC }]);
});

test("untrusted credits are bounded and only safe identity fields are retained", () => {
  const artists = normalizeArtistCredits([{ name: "2Pac", channelId: PAC, token: "private" }, { name: "2Pac", channelId: PAC }, { name: "Dr. Dre", id: "external-provider-id" }, null, {}]);
  assert.deepEqual(artists, [{ name: "2Pac", channelId: PAC }, { name: "Dr. Dre" }]);
  assert.equal(normalizeArtistCredits(Array.from({ length: 100 }, (_, i) => ({ name: `Artist ${i}` }))).length, 20);
  assert.equal(normalizeArtistCredits([{ name: "x".repeat(500) }])[0].name.length, 120);
});

test("channel choices preserve ambiguous matches and reject unsafe channel destinations", () => {
  const choices = artistChannelChoices([{ id: PAC, title: "2Pac" }, { id: DRE, title: "2Pac - Topic" }, { id: "javascript:alert(1)", title: "2Pac" }, { id: PAC, title: "2Pac" }, { id: "UCcccccccccccccccccccccc", title: "Unrelated" }], "2Pac");
  assert.deepEqual(choices.map(item => item.id), [PAC, DRE]);
  assert.deepEqual(artistChannelChoices(null, "2Pac"), []);
});
