import assert from "node:assert/strict";
import test from "node:test";
import {
  captionLinesFromJson3,
  captionLinesFromTranscript,
  captionLinesFromVtt,
  captionTracksFromPlayerResponse,
  pickCaptionTrack,
  pickTimedTextTrack,
  playerResponseFromWatchHtml,
} from "../src/utils/youtubeCaptions.mjs";

test("json3 caption events become timed lines", () => {
  const lines = captionLinesFromJson3({
    events: [
      { tStartMs: 1200, segs: [{ utf8: "Hello " }, { utf8: "Kasa" }] },
      { tStartMs: 2400, segs: [{ utf8: "♪" }] },
      { tStartMs: 3600, segs: [{ utf8: "Next line" }] },
    ],
  });
  assert.deepEqual(lines, [
    { time: 1.2, text: "Hello Kasa" },
    { time: 3.6, text: "Next line" },
  ]);
});

test("vtt and transcript parsers keep start times", () => {
  const vtt = captionLinesFromVtt(`WEBVTT

00:00:01.000 --> 00:00:02.000
First

00:00:03.500 --> 00:00:04.000
Second`);
  assert.equal(vtt[0].time, 1);
  assert.equal(vtt[1].text, "Second");
  const transcript = captionLinesFromTranscript([
    { start_ms: "1500", snippet: { toString: () => "Live line" } },
  ]);
  assert.deepEqual(transcript, [{ time: 1.5, text: "Live line" }]);
});

test("caption track picker prefers manual English over auto-captions", () => {
  const tracks = [
    { base_url: "https://example/asr", language_code: "en", kind: "asr" },
    { base_url: "https://example/en", language_code: "en" },
    { base_url: "https://example/es", language_code: "es" },
  ];
  assert.equal(pickCaptionTrack(tracks).base_url, "https://example/en");
  assert.equal(pickCaptionTrack([{ baseUrl: "https://example/ko", languageCode: "ko" }]).base_url, "https://example/ko");
});

test("timedtext list picker prefers English then any language", () => {
  const xml = `<transcript_list><track lang_code="ko" /><track lang_code="en" kind="asr" /><track id="1" lang_code="en" /></transcript_list>`;
  assert.equal(pickTimedTextTrack(xml).lang, "en");
  assert.equal(pickTimedTextTrack(xml).kind, "");
  assert.equal(pickTimedTextTrack(`<transcript_list><track lang_code="ja" kind="asr" /></transcript_list>`).lang, "ja");
});

test("watch-page player JSON yields caption tracks", () => {
  const html = `<script>var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=abcdefghijk","languageCode":"en","kind":"asr"},{"baseUrl":"https://www.youtube.com/api/timedtext?v=abcdefghijk&lang=en","languageCode":"en"}]}}};</script>`;
  const tracks = captionTracksFromPlayerResponse(playerResponseFromWatchHtml(html));
  assert.equal(tracks.length, 2);
  assert.equal(pickCaptionTrack(tracks).language_code, "en");
  assert.equal(pickCaptionTrack(tracks).kind, "");
  assert.equal(playerResponseFromWatchHtml("<html></html>"), null);
});
