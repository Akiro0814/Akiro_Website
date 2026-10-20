import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { normalizeMediaUrl } from '../src/lib/media-url.js';
import { createFixture, PROJECT_ROOT } from './helpers/fixture.mjs';

test('hero media accepts image/video URLs and excludes executable or protocol-relative URLs', () => {
  for (const url of ['/uploads/照片.jpg', 'https://example.com/hero.mp4?version=1', 'http://example.com/hero.webp', '']) {
    assert.equal(normalizeMediaUrl(url), url);
  }
  for (const url of ['javascript:alert(1)', 'data:image/svg+xml,bad', '//evil.com/file', '/\\evil.com/file', 'https://', 'https://a.test/\nfile']) {
    assert.equal(normalizeMediaUrl(url), '');
  }
});

test('hero background survives partial saves, clears explicitly and rejects invalid protocols without losing data', async (t) => {
  const fixture = createFixture(t);
  fs.mkdirSync(path.join(fixture.root, 'src', 'lib'), { recursive: true });
  fs.copyFileSync(path.join(PROJECT_ROOT, 'src', 'lib', 'media-url.js'), path.join(fixture.root, 'src', 'lib', 'media-url.js'));
  const { getProfile, saveProfile } = await fixture.importModule('site-data.mjs');
  assert.equal(getProfile().hero.backgroundUrl, '');
  await saveProfile({ hero: { backgroundUrl: '/uploads/照片.jpg' } });
  await saveProfile({ hero: { title: 'Akiro' } });
  assert.equal(getProfile().hero.backgroundUrl, '/uploads/照片.jpg');
  await assert.rejects(saveProfile({ hero: { backgroundUrl: 'javascript:bad' } }), /首屏背景/);
  assert.equal(getProfile().hero.backgroundUrl, '/uploads/照片.jpg');
  await saveProfile({ hero: { backgroundUrl: '' } });
  assert.equal(getProfile().hero.backgroundUrl, '');
});
