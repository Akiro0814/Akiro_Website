import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as appearance from '../src/lib/appearance.js';
import { normalizePresentation } from '../src/lib/presentation.js';
import { normalizeAppearance as adminAppearance } from '../admin/public/ui-model.js';

test('四组参考配色保留原色，未知偏好安全回退', () => {
  assert.equal(typeof appearance.normalizePalette, 'function');
  assert.deepEqual(appearance.PALETTES.find((p) => p.id === 'coral').colors, ['#F0826E', '#F0B4A9', '#FEFEE1']);
  assert.equal(appearance.PALETTES.length, 5);
  assert.equal(appearance.normalizePalette('ocean'), 'ocean');
  assert.equal(appearance.normalizePalette('invalid'), 'original');
});

test('站点默认配色可保存，部分更新与非法值保留上次配置', () => {
  const saved = normalizePresentation({ defaultPalette: 'berry' });
  assert.equal(saved.defaultPalette, 'berry');
  assert.equal(normalizePresentation({ author: '作者' }, saved).defaultPalette, 'berry');
  assert.equal(normalizePresentation({ defaultPalette: 'bad' }, saved).defaultPalette, 'berry');
});

test('后台个人配色与站点默认独立，并兼容旧偏好', () => {
  assert.equal(adminAppearance({ palette: 'apricot', theme: 'dark' }).palette, 'apricot');
  assert.equal(adminAppearance({ theme: 'light' }).palette, 'original');
  assert.equal(adminAppearance({ palette: '<invalid>' }).palette, 'original');
});
