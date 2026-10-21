import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { createFixture, addRelease } from './helpers/fixture.mjs';

test('公开计数只读取 current 发布快照，保存未发布与失败构建不改变它', async (t) => {
  const fixture = createFixture(t);
  const { publishedPostCount } = await fixture.importModule('published-content.mjs');
  const content = await fixture.importModule('content.mjs');
  content.saveEntry('posts', '未发布', { title: '未发布' }, '正文');
  assert.equal(publishedPostCount(), 0);
  const release = addRelease(fixture.root, '001', { current: true });
  fs.writeFileSync(path.join(release, 'search.json'), JSON.stringify([{ url: '/posts/旧文章/' }]));
  assert.equal(publishedPostCount(), 1);
  content.deleteEntry('posts', '未发布');
  assert.equal(publishedPostCount(), 1);
  fs.writeFileSync(path.join(fixture.root, 'fixture-build.mjs'), 'process.exit(1)');
  process.env.BACKUP_ENABLED = 'false';
  assert.equal((await (await fixture.importModule('build.mjs')).buildAndPublish()).ok, false);
  assert.equal(publishedPostCount(), 1);
});

for (const [oldCount, newCount] of [[0, 1], [1, 0]]) {
  test(`回滚后公开计数从 ${newCount} 跟随快照变为 ${oldCount}，不改变源数据`, async (t) => {
    const fixture = createFixture(t);
    for (const [name, count] of [['001', oldCount], ['002', newCount]]) {
      const release = addRelease(fixture.root, name, { current: name === '002' });
      fs.writeFileSync(path.join(release, 'search.json'), JSON.stringify(Array.from({ length: count }, (_, i) => ({ url: `/posts/p${i}/` }))));
    }
    const { publishedPostCount } = await fixture.importModule('published-content.mjs');
    assert.equal(publishedPostCount(), newCount);
    (await fixture.importModule('build.mjs')).rollback();
    assert.equal(publishedPostCount(), oldCount);
    assert.deepEqual((await fixture.importModule('content.mjs')).listEntries('posts'), []);
  });
}
