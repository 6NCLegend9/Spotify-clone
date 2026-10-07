import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Isolate the existing HTTP boundary; exercise the actual hydration implementation.
const source = (await readFile(new URL('../src/services/libraryApi.js', import.meta.url), 'utf8'))
  .replace('import { requestJson } from "@/services/http";', 'let reply; let failure; export function respond(value, error) { reply = value; failure = error; } async function requestJson() { if (failure) throw failure; return reply; }')
  .replace('import { toUserError } from "@/utils/userError";', 'function toUserError(error) { return error || new Error("Invalid metadata"); }');
const library = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const available = { id: 'abcdefghijk', title: 'Available song', duration: 200 };
const missing = '12345678901';

test('unavailable placeholders are opt-in and preserve saved order', async () => {
  library.respond({ tracks: [available] });
  assert.deepEqual(await library.hydrateYouTubeTracks([missing, available.id]), [available]);
  const tracks = await library.hydrateYouTubeTracks([missing, available.id], { retainUnavailable: true });
  assert.equal(tracks.length, 2);
  assert.equal(tracks[0].id, missing);
  assert.equal(tracks[0].unavailable, true);
  assert.deepEqual(tracks[1], available);
});

test('failed and malformed metadata responses never become unavailable placeholders', async () => {
  const error = new Error('Temporary outage');
  library.respond(null, error);
  await assert.rejects(library.hydrateYouTubeTracks([missing], { retainUnavailable: true }), error);
  library.respond({});
  await assert.rejects(library.hydrateYouTubeTracks([missing], { retainUnavailable: true }));
});
