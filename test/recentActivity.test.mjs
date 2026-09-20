import test from 'node:test';
import assert from 'node:assert/strict';
import { prependHistory, recentTracks, removeSearchTerm } from '../src/utils/recentActivity.mjs';
import { createContextGesture } from '../src/utils/contextGesture.mjs';

test('history keeps the most recent 100 distinct songs and promotes replayed songs', () => {
  const songs = Array.from({length: 120}, (_, i) => ({id: String(i), title: `Song ${i}`}));
  assert.equal(recentTracks(songs).length, 100);
  const result = prependHistory(songs, {...songs[50], title: 'Played again'});
  assert.equal(result[0].id, '50');
  assert.equal(result.filter(s => s.id === '50').length, 1);
  assert.equal(result.length, 100);
  assert.deepEqual(recentTracks([null, {}, songs[0], songs[0]]), [songs[0]]);
});

test('deleting a search removes only that term, regardless of case', () => {
  assert.deepEqual(removeSearchTerm(['Adele', 'Hello', 'adele'], ' ADELE '), ['Hello']);
  assert.deepEqual(removeSearchTerm(undefined, 'hello'), []);
});

function fixture() {
  const callbacks = new Map(); let next = 0, opens = 0;
  const gesture = createContextGesture(() => opens++, fn => { callbacks.set(++next, fn); return next; }, id => callbacks.delete(id));
  return {gesture, opens: () => opens, fire: () => { const fns = [...callbacks.values()]; callbacks.clear(); fns.forEach(fn=>fn()); }};
}
const touch = {pointerType:'touch', isPrimary:true, clientX:10, clientY:10};
test('long press opens options and consumes the subsequent play/navigation click', () => {
  const f = fixture(); f.gesture.down(touch); f.fire();
  assert.equal(f.opens(),1); f.gesture.up();
  assert.equal(f.gesture.consumeClick(),true); assert.equal(f.gesture.consumeClick(),false);
});
test('scrolling, cancellation, and ordinary taps do not open a menu', () => {
  for (const finish of [g=>g.move({...touch, clientY:30}), g=>g.cancel(), g=>g.up()]) {
    const f=fixture(); f.gesture.down(touch); finish(f.gesture); f.fire(); assert.equal(f.opens(),0);
  }
});
test('mouse and secondary touch do not start a long press', () => {
  for (const event of [{...touch,pointerType:'mouse'}, {...touch,isPrimary:false}]) {
    const f=fixture(); f.gesture.down(event); f.fire(); assert.equal(f.opens(),0);
  }
});
