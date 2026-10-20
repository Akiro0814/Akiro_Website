import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CURSOR_DEFAULTS, normalizeCursorSettings, readCursorSettings } from '../src/lib/cursor-settings.js';

test('光标默认关闭平滑跟随，主动选择与所有参数限制在可用范围内', () => {
  assert.equal(CURSOR_DEFAULTS.smooth, false);
  assert.equal(readCursorSettings({ getItem: () => null }).smooth, false);
  assert.equal(readCursorSettings({ getItem: () => '{"smooth":true}' }).smooth, true);
  assert.ok(CURSOR_DEFAULTS.duration >= 50 && CURSOR_DEFAULTS.duration <= 80 && CURSOR_DEFAULTS.maxLag <= 32);
  const settings = normalizeCursorSettings({ enabled: 'false', smooth: false, duration: 9999, maxLag: -1, size: '36', hoverScale: Infinity, pressScale: 0, transition: null, arbitrary: 'ignored' });
  assert.equal(settings.enabled, true);
  assert.equal(settings.smooth, false);
  assert.equal(settings.duration, 220);
  assert.equal(settings.maxLag, 8);
  assert.equal(settings.size, 36);
  assert.equal(settings.hoverScale, CURSOR_DEFAULTS.hoverScale);
  assert.equal(settings.pressScale, .7);
  assert.equal(settings.transition, CURSOR_DEFAULTS.transition);
  assert.equal('arbitrary' in settings, false);
  assert.deepEqual(normalizeCursorSettings(null), CURSOR_DEFAULTS);
  assert.equal(normalizeCursorSettings({ duration: 23 }).duration, 25);
  assert.equal(normalizeCursorSettings({ hoverScale: 1.234 }).hoverScale, 1.23);
  assert.equal(normalizeCursorSettings({ duration: 95, maxLag: 48 }).duration, 70);
  assert.equal(normalizeCursorSettings({ duration: 150, maxLag: 80 }).duration, 150);
});

test('损坏或被禁用的本地存储安全回退，不覆盖有效关闭偏好', () => {
  assert.deepEqual(readCursorSettings({ getItem: () => '{broken' }), CURSOR_DEFAULTS);
  assert.deepEqual(readCursorSettings({ getItem: () => { throw Error('denied'); } }), CURSOR_DEFAULTS);
  assert.deepEqual(readCursorSettings({ getItem: () => '[]' }), CURSOR_DEFAULTS);
  const saved = readCursorSettings({ getItem: () => JSON.stringify({ enabled: false, smooth: false, size: 30 }) });
  assert.equal(saved.enabled, false);
  assert.equal(saved.smooth, false);
  assert.equal(saved.size, 30);
});
