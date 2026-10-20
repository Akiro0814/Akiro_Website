import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { normalizePresentation } from '../src/lib/presentation.js';
import { createFixture, PROJECT_ROOT } from './helpers/fixture.mjs';

test('前台配置只接受支持的模式和数量，缺少字段保留当前值', () => {
  const saved = normalizePresentation({ author: '新名字', defaultStyle: 'glass', wallpaperMode: 'fixed', featuredLimit: 999, heroWords: ['一', '二'], navItems: ['/notes/', 'https://evil.test'] });
  assert.equal(saved.author, '新名字');
  assert.equal(saved.featuredLimit, 12);
  assert.equal(saved.defaultStyle, 'glass');
  assert.equal(saved.wallpaperMode, 'fixed');
  assert.deepEqual(saved.navItems, ['/notes/']);
  const updated = normalizePresentation({ showWriting: false, defaultStyle: 'unknown', avatar: 'javascript:bad' }, saved);
  assert.equal(updated.author, '新名字');
  assert.equal(updated.showWriting, false);
  assert.equal(updated.defaultStyle, 'glass');
  assert.equal(updated.avatar, saved.avatar);
});
test('后台保存配置与显式清空列表不会被默认值覆盖', async (t) => {
  const fixture = createFixture(t);
  fs.mkdirSync(path.join(fixture.root, 'src', 'lib'), { recursive: true });
  for (const file of ['media-url.js', 'presentation.js', 'appearance.js']) fs.copyFileSync(path.join(PROJECT_ROOT, 'src', 'lib', file), path.join(fixture.root, 'src', 'lib', file));
  const { getProfile, saveProfile } = await fixture.importModule('site-data.mjs');
  const out = await saveProfile({ presentation: { writingTitle: '我的新标题', showProjects: false, defaultStyle: 'glass' }, hero: { socials: [] }, footer: { links: [] } });
  assert.equal(out.presentation.writingTitle, '我的新标题');
  assert.equal(out.presentation.showProjects, false);
  assert.deepEqual(out.hero.socials, []);
  assert.deepEqual(out.footer.links, []);
  await saveProfile({ hero: { bio: '其他修改' } });
  assert.equal(getProfile().presentation.writingTitle, '我的新标题');
  assert.equal(getProfile().presentation.showProjects, false);
});
