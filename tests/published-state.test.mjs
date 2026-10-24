import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { addRelease, createFixture } from './helpers/fixture.mjs';

test('公开状态不回退待发布源数据，切换和回滚跟随 current', async (t) => {
  const fixture = createFixture(t);
  const { readPublishedState } = await fixture.importModule('published-state.mjs');
  assert.equal(readPublishedState(), null);
  const first = addRelease(fixture.root, '001', { current: true });
  const second = addRelease(fixture.root, '002');
  for (const [dir, title] of [[first, '旧公告'], [second, '新公告']]) {
    fs.mkdirSync(path.join(dir, '_published'));
    fs.writeFileSync(path.join(dir, '_published/state.json'), JSON.stringify({ version: 1, announcements: [{ title }] }));
  }
  assert.equal(readPublishedState().announcements[0].title, '旧公告');
  fs.mkdirSync(path.join(fixture.root, 'data'));
  fs.writeFileSync(path.join(fixture.root, 'data/announcements.json'), '[{"title":"待发布"}]');
  assert.equal(readPublishedState().announcements[0].title, '旧公告');
  fs.unlinkSync(path.join(fixture.root, 'current'));
  fs.symlinkSync(second, path.join(fixture.root, 'current'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(readPublishedState().announcements[0].title, '新公告');
  assert.equal(readPublishedState(first).announcements[0].title, '旧公告');
  const { rollback } = await fixture.importModule('build.mjs');
  rollback();
  assert.equal(readPublishedState().announcements[0].title, '旧公告');
});

test('独立评论快照仅供内部构建取样，剔除邮箱、UA、隐藏评论和投票身份', async (t) => {
  const fixture = createFixture(t);
  const { createCommentService } = await fixture.importModule('comment-service.mjs');
  const service = createCommentService({ dataDir: path.join(fixture.root, 'data'), notify: async () => {} });
  const first = await service.submit({ url: '/notes/', nick: '读者', mail: 'private@example.com', comment: '公开正文' }, { ua: 'private-agent', ip: '192.0.2.1' });
  await service.reply({ id: first.id, comment: '回复正文' });
  await service.like(first.id, { ip: '192.0.2.1', ua: 'private-agent' });
  let snapshot = await service.snapshot();
  assert.equal(snapshot.comments.length, 2);
  assert.doesNotMatch(JSON.stringify(snapshot), /private@example|private-agent|192\.0\.2|votes/);
  await service.setStatus(first.id, 'hidden');
  snapshot = await service.snapshot();
  assert.equal(snapshot.comments.length, 0);
});
