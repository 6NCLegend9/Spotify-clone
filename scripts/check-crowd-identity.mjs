import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyCrowdProfiles } from '../src/utils/crowdProfiles.mjs';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = publicKey.export({ format: 'jwk' });
const now = Date.now();
function profile(overrides = {}) {
  const message = JSON.stringify({ event: 'crowd-profile', roomId: 'room', senderId: 'alice', at: now,
    payload: { name: 'Alice', artists: ['Artist'], genres: ['Soul'] }, ...overrides });
  return { message, signature: sign('sha256', Buffer.from(message), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url') };
}
const verify = (profiles, options = {}) => verifyCrowdProfiles(profiles, jwk, 'room', { now, ...options });
test('real signatures preserve authenticated identity; duplicate tabs count once', async () => {
  const signed = profile();
  const result = await verify([signed, signed]);
  assert.equal(result.length, 1); assert.equal(result[0].id, 'alice');
  assert.deepEqual(result[0].artists, ['Artist']);
});
test('forged name or tastes cannot be substituted', async () => {
  const signed = profile(); signed.message = signed.message.replace('Alice', 'Mallory');
  assert.deepEqual(await verify([signed]), []);
});
test('wrong room, event, expired and future profiles are rejected', async () => {
  for (const change of [{ roomId: 'other' }, { event: 'heartbeat' }, { at: now - 30_001 }, { at: now + 5_001 }]) {
    assert.deepEqual(await verify([profile(change)]), []);
  }
});
test('current membership excludes departed listeners despite a valid signature', async () => {
  assert.deepEqual(await verify([profile()], { memberIds: ['bob'] }), []);
});
test('malformed, oversized and unsigned transport entries fail closed', async () => {
  assert.deepEqual(await verify([null, {}, { id: 'alice' }, { message: 'x'.repeat(4097), signature: 'x' }]), []);
});
test('repeated presence snapshots remain valid, but expire by wall clock', async () => {
  const signed = profile();
  assert.equal((await verify([signed])).length, 1);
  assert.equal((await verify([signed])).length, 1);
  assert.equal((await verify([signed], { now: now + 30_001 })).length, 0);
});
