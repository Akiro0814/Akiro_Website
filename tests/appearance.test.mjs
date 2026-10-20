import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAppearance, styleForTime, styleForScroll } from '../src/lib/appearance.js';

test('invalid persisted appearance cannot become a CSS style or mode', () => {
  assert.deepEqual(normalizeAppearance('unknown','broken'), { style: 'life', mode: 'manual' });
  assert.deepEqual(normalizeAppearance('brutalist','scroll'), { style: 'brutalist', mode: 'scroll' });
});
test('time-driven style follows morning, daytime and evening', () => {
  assert.equal(styleForTime(6), 'minimalist');
  assert.equal(styleForTime(8), 'minimalist');
  assert.equal(styleForTime(9), 'life');
  assert.equal(styleForTime(17), 'life');
  assert.equal(styleForTime(18), 'glass');
  assert.equal(styleForTime(0), 'glass');
});
test('scroll style clamps position and has deterministic sections', () => {
  assert.equal(styleForScroll(-1), 'life');
  assert.equal(styleForScroll(0.35), 'minimalist');
  assert.equal(styleForScroll(0.7), 'glass');
  assert.equal(styleForScroll(2), 'brutalist');
});
