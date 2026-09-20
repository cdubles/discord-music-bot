import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatDuration, parseDuration } from '../src/util/time.js';
import {
  clampVolume,
  isPurePlaylistUrl,
  isUrl,
  isYouTubePlaylistUrl,
  parseIndex,
  stripPlaylistParam,
} from '../src/util/validate.js';

test('parseDuration accepts the formats we document', () => {
  assert.equal(parseDuration('90'), 90_000);
  assert.equal(parseDuration('1:30'), 90_000);
  assert.equal(parseDuration('1:02:03'), 3_723_000);
  assert.equal(parseDuration('1m30s'), 90_000);
  assert.equal(parseDuration('2h'), 7_200_000);
  assert.equal(parseDuration('45s'), 45_000);
});

test('parseDuration rejects nonsense', () => {
  assert.equal(parseDuration('abc'), null);
  assert.equal(parseDuration(''), null);
  assert.equal(parseDuration(null), null);
  assert.equal(parseDuration('1:99'), null, 'seconds must be < 60');
});

test('formatDuration renders m:ss and h:mm:ss', () => {
  assert.equal(formatDuration(90_000), '1:30');
  assert.equal(formatDuration(3_723_000), '1:02:03');
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(-5), '0:00');
});

test('isUrl distinguishes links from search terms', () => {
  assert.ok(isUrl('https://youtube.com/watch?v=abc'));
  assert.ok(!isUrl('never gonna give you up'));
  assert.ok(!isUrl('ftp://example.com'), 'only http(s)');
});

test('playlist URLs are recognised and narrowed correctly', () => {
  const pure = 'https://www.youtube.com/playlist?list=PL123';
  const withVideo = 'https://www.youtube.com/watch?v=abc&list=PL123';

  assert.ok(isYouTubePlaylistUrl(pure));
  assert.ok(isYouTubePlaylistUrl(withVideo));

  assert.ok(isPurePlaylistUrl(pure));
  assert.ok(!isPurePlaylistUrl(withVideo), 'a shared song link is not a playlist request');

  assert.equal(
    stripPlaylistParam(withVideo),
    'https://www.youtube.com/watch?v=abc',
    'the list param is dropped so only the song plays',
  );
});

test('clampVolume bounds input', () => {
  assert.equal(clampVolume(50), 50);
  assert.equal(clampVolume(-10), 0);
  assert.equal(clampVolume(500), 200);
  assert.equal(clampVolume('abc'), null);
});

test('parseIndex converts 1-based input and rejects out-of-range', () => {
  assert.equal(parseIndex(1, 3), 0);
  assert.equal(parseIndex(3, 3), 2);
  assert.equal(parseIndex(0, 3), null);
  assert.equal(parseIndex(4, 3), null);
});
