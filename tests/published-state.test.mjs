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

test('官方评论快照支持回复树和计数，不泄露运行库身份或隐藏评论', async (t) => {
  const fixture = createFixture(t);
  const { createPublishedComments, sanitizeComments } = await fixture.importModule('published-comments.mjs');
  const raw = [
    { _id: 'parent', nick: '读者', mail: 'private@example.com', ip: '192.0.2.1', uid: 'secret', mailMd5: 'hash', url: '/notes/', comment: '<p>公开</p>', created: 1, ups: ['secret'] },
    { _id: 'reply', rid: 'parent', pid: 'parent', nick: '站长', url: '/notes/', comment: '回复', created: 2, master: true },
    { _id: 'hidden', url: '/notes/', comment: '隐藏', isSpam: true },
    { _id: 'orphan', rid: 'hidden', url: '/notes/', comment: '隐藏回复' },
  ];
  const comments = sanitizeComments(raw);
  assert.doesNotMatch(JSON.stringify(comments), /private@example|192\.0\.2|secret|隐藏/);
  const call = createPublishedComments({ comments, config: { COMMENT_PAGE_SIZE: '1' }, counters: [] });
  const result = await call({ event: 'COMMENT_GET', url: '/notes/' });
  assert.equal(result.body.data[0].id, 'parent');
  assert.equal(result.body.data[0].replies[0].id, 'reply');
  assert.equal(result.body.data[0].ups, 1);
  const count = await call({ event: 'GET_COMMENTS_COUNT', urls: ['/notes/'], includeReply: true });
  assert.equal(count.body.data[0].count, 2);
  raw.push({ _id: 'unpublished', url: '/notes/', comment: '新评论' });
  assert.equal((await call({ event: 'COMMENT_GET', url: '/notes/' })).body.data.length, 1);
});
