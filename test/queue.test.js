import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LoopMode } from '../src/constants.js';
import Queue from '../src/core/Queue.js';
import Track from '../src/core/Track.js';

const track = (id) =>
  new Track({ id, url: `https://youtu.be/${id}`, title: `Song ${id}`, durationMs: 1000 });

test('add appends and respects the size cap', () => {
  const queue = new Queue({ maxSize: 3 });
  assert.equal(queue.add([track('a'), track('b')]), 2);
  assert.equal(queue.add([track('c'), track('d')]), 1, 'cap rejects the overflow');
  assert.equal(queue.size, 3);
});

test('add can insert at a position', () => {
  const queue = new Queue();
  queue.add([track('a'), track('b')]);
  queue.add(track('c'), { position: 0 });
  assert.deepEqual(
    queue.tracks.map((t) => t.id),
    ['c', 'a', 'b'],
  );
});

test('next advances and records history', () => {
  const queue = new Queue();
  queue.add([track('a'), track('b')]);

  assert.equal(queue.next().id, 'a');
  assert.equal(queue.next().id, 'b');
  assert.deepEqual(
    queue.previous.map((t) => t.id),
    ['a'],
  );
  assert.equal(queue.next(), null, 'exhausted queue returns null');
});

test('loop track replays the same track', () => {
  const queue = new Queue();
  queue.add([track('a'), track('b')]);
  queue.next();
  queue.loopMode = LoopMode.TRACK;

  assert.equal(queue.next().id, 'a');
  assert.equal(queue.next().id, 'a');
  assert.equal(queue.size, 1, 'the rest of the queue is untouched');
});

test('loop queue rotates tracks back to the end', () => {
  const queue = new Queue();
  queue.add([track('a'), track('b')]);
  queue.loopMode = LoopMode.QUEUE;

  assert.equal(queue.next().id, 'a');
  assert.equal(queue.next().id, 'b');
  assert.equal(queue.next().id, 'a', 'wraps around');
});

test('skip discards intermediate tracks', () => {
  const queue = new Queue();
  queue.add([track('a'), track('b'), track('c'), track('d')]);
  queue.next(); // now playing a

  queue.skip(3);
  assert.equal(queue.next().id, 'd');
});

test('remove and move reorder correctly', () => {
  const queue = new Queue();
  queue.add([track('a'), track('b'), track('c')]);

  assert.equal(queue.remove(1).id, 'b');
  assert.equal(queue.remove(99), null, 'out of range is a no-op');

  queue.add(track('d'));
  queue.move(0, 2);
  assert.deepEqual(
    queue.tracks.map((t) => t.id),
    ['c', 'd', 'a'],
  );
});

test('clear empties the queue but keeps the current track', () => {
  const queue = new Queue();
  queue.add([track('a'), track('b')]);
  queue.next();

  assert.equal(queue.clear(), 1);
  assert.equal(queue.current.id, 'a');
  assert.equal(queue.size, 0);
});

test('shuffle preserves the track set', () => {
  const queue = new Queue();
  const ids = ['a', 'b', 'c', 'd', 'e'];
  queue.add(ids.map(track));
  queue.shuffle();

  assert.deepEqual(queue.tracks.map((t) => t.id).sort(), [...ids].sort());
});

test('page clamps out-of-range page numbers', () => {
  const queue = new Queue();
  queue.add(Array.from({ length: 25 }, (_, i) => track(String(i))));

  assert.equal(queue.page(1, 10).items.length, 10);
  assert.equal(queue.page(3, 10).items.length, 5);
  assert.equal(queue.page(99, 10).page, 3, 'clamps to the last page');
  assert.equal(queue.page(0, 10).page, 1, 'clamps to the first page');
});
