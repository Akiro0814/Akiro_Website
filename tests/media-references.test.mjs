import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { createFixture, addRelease } from './helpers/fixture.mjs';

test('引用扫描覆盖正文、配置和回收站，编码查询串不漏报，同名前缀不误报', async (t) => {
  const fixture = createFixture(t);
  const content = await fixture.importModule('content.mjs');
  const name = '照片 #1.png';
  content.saveEntry('posts', '引用', { title: '引用文章' }, `![图](/uploads/${encodeURIComponent(name)}?v=1)`);
  content.saveEntry('posts', '误报', { title: '误报' }, '![图](/uploads/照片%20%231.png.bak)');
  content.saveEntry('notes', '回收', { date: '2026-10-01' }, `![图](/uploads/${encodeURIComponent(name)})`);
  content.deleteEntry('notes', '回收');
  fs.writeFileSync(path.join(fixture.root, 'data/profile.json'), JSON.stringify({ hero: { backgroundUrl: `/uploads/${name}` } }));
  const { findMediaReferences } = await fixture.importModule('media-references.mjs');
  const refs = findMediaReferences(name);
  assert.ok(refs.some((r) => r.title === '引用文章' && r.scope === 'pending'));
  assert.ok(refs.some((r) => r.field === 'hero.backgroundUrl'));
  assert.ok(refs.some((r) => r.scope === 'trash'));
  assert.ok(refs.every((r) => r.title !== '误报'));
});

test('线上引用来自构建快照索引，源文件删除不抹掉线上使用位置', async (t) => {
  const fixture = createFixture(t);
  const release = addRelease(fixture.root, '001', { current: true });
  fs.mkdirSync(path.join(release, '_published'));
  fs.writeFileSync(path.join(release, '_published/state.json'), JSON.stringify({ version: 1,
    mediaReferences: { 'a.png': [{ title: '线上文章', field: '正文', href: '/posts/a/', scope: 'published' }] } }));
  const { findMediaReferences } = await fixture.importModule('media-references.mjs');
  assert.equal(findMediaReferences('a.png')[0].title, '线上文章');
  assert.deepEqual(findMediaReferences('a.png.bak'), []);
});
