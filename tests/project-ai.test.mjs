import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createFixture } from './helpers/fixture.mjs';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status });

test('项目 AI 密钥只保存在私有文件，状态和草稿都不返回密钥', async (t) => {
  const fixture = createFixture(t);
  const ai = await fixture.importModule('project-ai.mjs');
  assert.equal(ai.projectAIStatus().configured, false);
  await assert.rejects(ai.analyzeProjectRepository('https://github.com/owner/repo'), /密钥/);
  assert.deepEqual(ai.saveProjectAIKey('test-fixture-secret'), { configured: true, provider: 'DeepSeek', model: 'deepseek-flash' });
  assert.equal(JSON.parse(fs.readFileSync(path.join(fixture.root, 'data/.private/project-ai.json'), 'utf8')).apiKey, 'test-fixture-secret');
  const calls = [];
  const draft = await ai.analyzeProjectRepository('https://github.com/owner/repo.git', { fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/readme')) return json({ encoding: 'base64', content: Buffer.from('# Repository\nUseful project').toString('base64') });
    if (url.startsWith('https://api.github.com/')) return json({ name: 'repo', language: 'JavaScript', description: 'Example' });
    return json({ choices: [{ message: { content: JSON.stringify({ title: '项目', subtitle: '说明', description: '项目介绍', tech: ['JS', 1], content: '# 使用说明', id: 'malicious', featured: true, cover: 'javascript:bad', links: [{ label: 'bad', url: 'http://localhost' }] }) } }] });
  } });
  assert.equal(calls.length, 3);
  assert.ok(calls.every(({ options }) => options.redirect === 'error' && options.signal));
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.equal(calls[2].options.headers.Authorization, 'Bearer test-fixture-secret');
  const payload = JSON.parse(calls[2].options.body);
  assert.equal(payload.model, 'deepseek-flash');
  assert.match(payload.messages[1].content, /Useful project/);
  assert.deepEqual(draft.links, [{ label: 'GitHub', url: 'https://github.com/owner/repo' }]);
  assert.deepEqual(draft.tech, ['JS']);
  assert.equal(draft.id, undefined);
  assert.equal(draft.cover, undefined);
  assert.equal(draft.featured, undefined);
  assert.equal(fs.existsSync(path.join(fixture.root, 'data/projects.json')), false);
  assert.equal(ai.saveProjectAIKey('').configured, false);
});

test('项目 AI 拒绝任意目标、仓库子路径和凭证地址', async (t) => {
  const { importModule } = createFixture(t);
  const ai = await importModule('project-ai.mjs');
  for (const url of ['http://github.com/a/b', 'https://127.0.0.1/a/b', 'https://github.com.evil.test/a/b', 'https://user:pass@github.com/a/b', 'https://github.com/a/b/tree/main', 'https://github.com/a/b?url=http://localhost', 'https://github.com/a/%2fprivate']) {
    assert.throws(() => ai.parseGitHubRepository(url), /公开仓库|仅支持/);
  }
  assert.deepEqual(ai.parseGitHubRepository('https://github.com/owner/repo/'), { owner: 'owner', name: 'repo', url: 'https://github.com/owner/repo' });
  assert.throws(() => ai.saveProjectAIKey('bad\nkey'), /格式无效/);
  assert.throws(() => ai.saveProjectAIKey('x'.repeat(513)), /格式无效/);
});

test('项目 AI 限制响应大小、隐藏远程错误并拒绝非法模型输出', async (t) => {
  const { importModule } = createFixture(t);
  const ai = await importModule('project-ai.mjs');
  ai.saveProjectAIKey('test-only-secret');
  await assert.rejects(ai.analyzeProjectRepository('https://github.com/a/b', { fetchImpl: async () => new Response('x'.repeat(160001)) }), /响应过大/);
  await assert.rejects(ai.analyzeProjectRepository('https://github.com/a/b', { fetchImpl: async () => { throw new Error('Authorization: test-only-secret'); } }), (error) => !error.message.includes('secret') && /连接失败/.test(error.message));
  await assert.rejects(ai.analyzeProjectRepository('https://github.com/a/b', { fetchImpl: async (url) => url.includes('deepseek') ? json({ choices: [{ message: { content: 'not JSON' } }] }) : url.endsWith('/readme') ? json({}, 404) : json({ name: 'b' }) }), /AI 返回内容格式无效/);
});

test('项目 AI 读取响应正文期间仍受超时限制', async (t) => {
  const { importModule } = createFixture(t);
  const ai = await importModule('project-ai.mjs');
  ai.saveProjectAIKey('test-only-secret');
  await assert.rejects(ai.analyzeProjectRepository('https://github.com/a/b', {
    timeoutMs: 20,
    fetchImpl: async (url, options) => {
      if (!url.includes('deepseek')) return url.endsWith('/readme') ? json({}, 404) : json({ name: 'b' });
      return new Response(new ReadableStream({ start(controller) { options.signal.addEventListener('abort', () => controller.error(new Error('aborted')), { once: true }); } }));
    },
  }), /超时/);
});

test('项目 AI 路由要求登录，配置和分析要求 CSRF', async (t) => {
  const { importModule } = createFixture(t);
  const { manageRouter } = await importModule('routes.mjs');
  const app = express();
  app.use(express.json());
  app.use(manageRouter({
    requireApiAuth(req, res, next) { if (req.get('x-test-auth') !== 'yes') return res.sendStatus(401); next(); },
    requireCsrf(req, res, next) { if (req.get('x-test-csrf') !== 'yes') return res.sendStatus(403); next(); },
  }));
  const server = await new Promise((resolve) => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${base}/projects/ai/config`)).status, 401);
  for (const endpoint of ['config', 'analyze']) assert.equal((await fetch(`${base}/projects/ai/${endpoint}`, { method: 'POST', headers: { 'x-test-auth': 'yes' } })).status, 403);
  const response = await fetch(`${base}/projects/ai/config`, { method: 'POST', headers: { 'x-test-auth': 'yes', 'x-test-csrf': 'yes', 'content-type': 'application/json' }, body: JSON.stringify({ apiKey: 'test-only-secret' }) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).configured, true);
});
