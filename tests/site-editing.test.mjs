import test from 'node:test';
import assert from 'node:assert/strict';
import { createFixture } from './helpers/fixture.mjs';

test('手动新增友链直接进入待发布的已通过列表，未知编辑 ID 不创建', async (t) => {
  const fixture = createFixture(t);
  const site = await fixture.importModule('site-data.mjs');
  const item = await site.saveFriend({ name: '示例网站', url: 'https://example.com', desc: '测试' });
  assert.ok(item.id);
  assert.equal(item.status, 'approved');
  assert.equal(site.getFriends().items.length, 1);
  await assert.rejects(site.saveFriend({ id: 'missing', name: '误编辑', url: 'https://example.org' }), /不存在/);
  const updated = await site.saveFriend({ id: item.id, name: '新名称' });
  assert.equal(updated.name, '新名称');
  assert.equal(site.getFriends().items.length, 1);
});

test('保存导航把旧分类合并为一组并给有效网站补图标，保留手动图标', async (t) => {
  const fixture = createFixture(t);
  const site = await fixture.importModule('site-data.mjs');
  const result = await site.saveNavLinks({ categories: [
    { name: '工具', links: [{ name: '例子', url: 'https://example.com/path' }] },
    { name: '阅读', links: [{ name: '阅读', url: 'https://example.org', icon: '/uploads/icon.png' }] },
  ] });
  assert.equal(result.categories.length, 1);
  assert.equal(result.categories[0].links.length, 2);
  assert.equal(result.categories[0].links[0].icon, 'https://example.com/favicon.ico');
  assert.equal(result.categories[0].links[1].icon, '/uploads/icon.png');
  await assert.rejects(site.saveNavLinks({ categories: [{ links: [{ name: '不安全', url: 'javascript:alert(1)' }] }] }), /http/);
});
