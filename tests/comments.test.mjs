import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createFixture } from './helpers/fixture.mjs';

test('独立评论迁移 Loki 分片，保留关系、隐藏、点赞，备份且删除不复活', async (t) => {
  const fixture = createFixture(t);
  const { createCommentService } = await fixture.importModule('comment-service.mjs');
  const dir = path.join(fixture.root, 'data');
  fs.mkdirSync(path.join(dir, 'twikoo'), { recursive: true });
  const original = [{ _id: 'root', url: '/notes/', nick: '旧读者', comment: '<p>正文</p>', ups: ['private'], ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0 Safari/537.36' }, { _id: 'reply', rid: 'root', pid: 'root', url: '/notes/', comment: '回复', master: true }, { _id: 'hidden', url: '/notes/', comment: '隐藏', isSpam: true }];
  fs.writeFileSync(path.join(dir, 'twikoo/db.json'), JSON.stringify({ collections: [{ name: 'comment', data: [] }, { name: 'config', data: [] }] }));
  fs.writeFileSync(path.join(dir, 'twikoo/db.json.0'), original.map(JSON.stringify).join('\n'));
  fs.writeFileSync(path.join(dir, 'twikoo/db.json.1'), '{"SHOW_UA":"false"}\n');
  let service = createCommentService({ dataDir: dir });
  let list = await service.list({ url: '/notes/' });
  assert.equal(list.items[0].id, 'root');
  assert.equal(list.items[0].like, 1);
  assert.equal(list.items[0].replies[0].id, 'reply');
  assert.ok(fs.existsSync(path.join(dir, 'comment-migration-backup/twikoo/db.json.0')));
  assert.doesNotMatch(JSON.stringify(list), /private|隐藏/);
  await service.remove('root');
  service = createCommentService({ dataDir: dir });
  assert.equal((await service.documents()).length, 1);
  assert.equal(fs.readFileSync(path.join(dir, 'twikoo/db.json.0'), 'utf8'), original.map(JSON.stringify).join('\n'));
});

test('独立评论并发写入、净化、隐私、设备解析、回复审核和持久化', async (t) => {
  const fixture = createFixture(t);
  const { createCommentService } = await fixture.importModule('comment-service.mjs');
  const options = { dataDir: path.join(fixture.root, 'data'), secret: 'isolated-test-secret' };
  const service = createCommentService(options);
  const context = { ip: '192.0.2.4', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', hints: { platform: 'Windows', platformVersion: '15.0.0' } };
  const results = await Promise.all(Array.from({ length: 4 }, (_, i) => service.submit({ url: '/notes/', nick: `读者${i}`, mail: 'private@example.com', comment: `正文${i} <img src=x onerror=alert(1)><script>alert(2)</script>` }, context)));
  const id = results[0].id;
  await service.reply({ id, comment: '**后台回复**' });
  await Promise.all(Array.from({ length: 5 }, () => service.like(id, context)));
  let list = await service.list({ url: '/notes/' });
  const item = list.items.find(c => c.id === id);
  assert.equal(item.like, 1);
  assert.equal(item.device.os, 'Windows 11');
  assert.match(item.device.browser, /Chrome 130/);
  assert.equal(item.replies[0].master, true);
  assert.doesNotMatch(JSON.stringify(list), /private@example|192\.0\.2|onerror|<script>|votes|ua"/);
  await service.setStatus(id, 'hidden');
  assert.equal((await service.list({ url: '/notes/' })).total, 3);
  await service.setStatus(id, 'visible');
  assert.equal((await createCommentService(options).documents()).length, 5);
  await assert.rejects(service.submit({ url: '/elsewhere/', nick: 'a', comment: 'x', pid: id }), /同一页面/);
  await service.saveSettings({ showDevice: false });
  list = await service.list({ url: '/notes/' });
  assert.ok(list.items.every(c => !c.device));
});

test('损坏的新库拒绝覆盖，损坏的旧库拒绝空迁移', async (t) => {
  const fixture = createFixture(t);
  const { createCommentService } = await fixture.importModule('comment-service.mjs');
  const dataDir = path.join(fixture.root, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'comments-store.json'), 'broken');
  await assert.rejects(createCommentService({ dataDir }).documents());
  assert.equal(fs.readFileSync(path.join(dataDir, 'comments-store.json'), 'utf8'), 'broken');
  fs.unlinkSync(path.join(dataDir, 'comments-store.json'));
  fs.mkdirSync(path.join(dataDir, 'twikoo'));
  fs.writeFileSync(path.join(dataDir, 'twikoo/db.json'), '{"collections":[{"name":"comment","data":[]}]}');
  fs.writeFileSync(path.join(dataDir, 'twikoo/db.json.0'), 'broken');
  await assert.rejects(createCommentService({ dataDir }).documents());
  assert.equal(fs.existsSync(path.join(dataDir, 'comments-store.json')), false);
  fs.writeFileSync(path.join(dataDir, 'twikoo/db.json'), '{"collections":[{"name":"comment","data":[]},{"name":"config","data":[]}]}');
  fs.writeFileSync(path.join(dataDir, 'twikoo/db.json.0'), '');
  await assert.rejects(createCommentService({ dataDir }).documents(), /分片缺失/);
});

test('导入补齐回复根节点，拒绝循环关系，导入失败不写入', async (t) => {
  const fixture = createFixture(t);
  const { createCommentService } = await fixture.importModule('comment-service.mjs');
  const service = createCommentService({ dataDir: path.join(fixture.root, 'data') });
  await service.import([{ id: 'root', url: '/notes/', comment: 'root' }, { id: 'reply', pid: 'root', url: '/notes/', comment: 'reply' }]);
  assert.equal((await service.list({ url: '/notes/' })).items[0].replies[0].id, 'reply');
  await assert.rejects(service.import([{ id: 'a', pid: 'b', url: '/notes/' }, { id: 'b', pid: 'a', url: '/notes/' }]), /循环/);
  assert.equal((await service.documents()).length, 2);
});

test('通知失败不阻止保存，任务持久化并可在重启后重试', async (t) => {
  const fixture = createFixture(t);
  const { createCommentService } = await fixture.importModule('comment-service.mjs');
  const dataDir = path.join(fixture.root, 'data');
  const service = createCommentService({ dataDir, notify: async () => { throw Error('fictional provider failure'); } });
  const result = await service.submit({ url: '/notes/', nick: '读者', comment: '通知测试' });
  assert.equal(result.ok, true);
  await service.close();
  assert.equal((await service.health()).pendingNotifications, 1);
  const file = path.join(dataDir, 'comments-store.json');
  const state = JSON.parse(fs.readFileSync(file, 'utf8')); state.outbox[0].due = 0;
  fs.writeFileSync(file, JSON.stringify(state));
  let sent = 0;
  const reopened = createCommentService({ dataDir, notify: async () => { sent++; } });
  await reopened.flushNotifications();
  assert.equal(sent, 1); assert.equal((await reopened.health()).pendingNotifications, 0);
});

test('分页只计主楼，隐藏楼中楼后公开统计一致，管理员可预写隐藏回复', async (t) => {
  const fixture = createFixture(t);
  const { createCommentService } = await fixture.importModule('comment-service.mjs');
  const service = createCommentService({ dataDir: path.join(fixture.root, 'data'), notify: async () => {} });
  await service.saveSettings({ pageSize: 1 });
  const root = await service.submit({ url: '/notes/', nick: '读者', comment: 'root' });
  const reply = await service.submit({ url: '/notes/', nick: '读者', comment: 'reply', pid: root.id });
  await service.submit({ url: '/notes/', nick: '读者', comment: 'nested', pid: reply.id });
  await service.submit({ url: '/notes/', nick: '读者', comment: 'another root' });
  assert.equal((await service.list({ url: '/notes/' })).pages, 2);
  await service.setStatus(reply.id, 'hidden');
  assert.equal((await service.list({ url: '/notes/' })).total, 2);
  assert.equal(await service.visibleCount(), 2);
  await service.reply({ id: reply.id, comment: '隐藏回复下的站长回复' });
  assert.equal(await service.visibleCount(), 2);
  await service.setStatus(reply.id, 'visible');
  assert.equal(await service.visibleCount(), 5);
  await service.close();
});

test('提交挑战绑定 IP，不能立即使用或过期后使用', async (t) => {
  const fixture = createFixture(t);
  const { createCommentService } = await fixture.importModule('comment-service.mjs');
  const service = createCommentService({ dataDir: path.join(fixture.root, 'data'), secret: 'fixture-secret' });
  const context = { ip: '192.0.2.10' };
  const { token } = service.challenge(context);
  assert.equal(service.verifyChallenge(token, context), false);
  await new Promise(resolve => setTimeout(resolve, 820));
  assert.equal(service.verifyChallenge(token, context), true);
  assert.equal(service.verifyChallenge(token, { ip: '192.0.2.11' }), false);
  assert.equal(service.verifyChallenge(`${token}tampered`, context), false);
  assert.equal(service.verifyChallenge(token.split('.').slice(0, 2).join('.') + '.' + '中'.repeat(64), context), false);
  const now = Date.now;
  t.mock.method(Date, 'now', () => now() + 1800001);
  assert.equal(service.verifyChallenge(token, context), false);
  t.mock.restoreAll();
});

test('通知配置可编辑并持久化，密钥不回显，留空保留、明确清空且 UI 配置优先于环境', async (t) => {
  const fixture = createFixture(t);
  const { createCommentService } = await fixture.importModule('comment-service.mjs');
  const dataDir = path.join(fixture.root, 'data');
  const service = createCommentService({ dataDir });
  await service.saveNotificationSettings({ SMTP_HOST: 'smtp.example.test', SMTP_PORT: 587, SMTP_SECURE: false, SMTP_USER: 'sender@example.test', SMTP_PASS: 'fixture-smtp-secret', BLOGGER_EMAIL: 'owner@example.test', PUSHOO_CHANNEL: 'serverchan', PUSHOO_TOKEN: 'SCTfixture-token' });
  let settings = await service.notificationSettings();
  assert.equal(settings.config.SMTP_HOST, 'smtp.example.test');
  assert.equal(settings.secrets.SMTP_PASS, true);
  assert.doesNotMatch(JSON.stringify(settings), /fixture-smtp-secret|SCTfixture-token/);
  await service.saveNotificationSettings({ SMTP_PASS: '', PUSHOO_TOKEN: '', SMTP_HOST: 'updated.example.test' });
  settings = await createCommentService({ dataDir }).notificationSettings();
  assert.equal(settings.secrets.SMTP_PASS, true);
  assert.equal(settings.secrets.PUSHOO_TOKEN, true);
  const previous = process.env.COMMENTS_SMTP_HOST; process.env.COMMENTS_SMTP_HOST = 'env.example.test';
  try { assert.equal((await service.notificationSettings()).config.SMTP_HOST, 'updated.example.test'); }
  finally { if (previous === undefined) delete process.env.COMMENTS_SMTP_HOST; else process.env.COMMENTS_SMTP_HOST = previous; }
  await service.saveNotificationSettings({ clearSMTP_PASS: true, clearPUSHOO_TOKEN: true });
  settings = await service.notificationSettings();
  assert.equal(settings.secrets.SMTP_PASS, false); assert.equal(settings.secrets.PUSHOO_TOKEN, false);
  await assert.rejects(service.saveNotificationSettings({ SMTP_PORT: 99999 }));
  assert.equal((await service.notificationSettings()).config.SMTP_PORT, '587');
  assert.equal((await service.list({ url: '/notes/' })).notificationConfig, undefined);
});

test('评论地址中文展示与 SMTP、站长推送使用同一安全解码结果', async (t) => {
  const fixture = createFixture(t);
  const { displayCommentUrl } = await fixture.importModule('comment-url.mjs');
  const { deliverCommentNotifications } = await fixture.importModule('comment-notifications.mjs');
  const url = '/posts/%E6%95%99%E7%A8%8B/%E4%B8%AD%E6%96%87/';
  assert.equal(displayCommentUrl(url), '/posts/教程/中文/');
  assert.doesNotThrow(() => displayCommentUrl('/%bad/'));
  const { commentService } = await fixture.importModule('comment-service.mjs');
  await commentService.import([{ id: 'chinese-search', url, comment: '正文' }]);
  const { adminList } = await fixture.importModule('comments.mjs');
  assert.equal((await adminList({ keyword: '教程' })).length, 1, '中文地址也应支持中文关键词搜索');
  let email; let push; let transportOptions;
  await deliverCommentNotifications({ nick: '读者', comment: '<p>中文正文</p>', url }, { owner: true }, { SMTP_HOST: 'smtp.example.test', SMTP_SERVICE: 'QQ', SMTP_PORT: 587, SMTP_SECURE: false, SMTP_USER: 'sender@example.test', SMTP_PASS: 'fixture-secret', BLOGGER_EMAIL: 'owner@example.test', PUSHOO_CHANNEL: 'serverchan', PUSHOO_TOKEN: 'SCTfixture-token', SITE_URL: 'https://example.test', SITE_NAME: '中文站点' }, {
    createTransport: options => { transportOptions = options; return { sendMail: async message => { email = message; }, close() {} }; },
    fetcher: async (_url, options) => { push = options.body.get('desp'); return { ok: true, json: async () => ({ code: 0 }) }; },
  });
  assert.match(email.text, /页面：\/posts\/教程\/中文\//);
  assert.match(push, /页面：\/posts\/教程\/中文\//);
  assert.doesNotMatch(email.text + push, /%E6|%E4/);
  assert.match(email.subject, /中文站点/);
  assert.equal(transportOptions.service, undefined, '填写 SMTP 主机后应使用显式参数，不被预设服务覆盖');
  assert.equal(transportOptions.secure, false); assert.equal(transportOptions.requireTLS, true);
});
