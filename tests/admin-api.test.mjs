import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { request } from '@playwright/test';
import { startPreview } from '../scripts/preview-admin.mjs';

test('真实后台拒绝非法路径/缺日期/无效音频，并保留权限和公开发布计数语义', { timeout: 30000 }, async (t) => {
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const preview = startPreview({ port, quiet: true });
  t.after(() => preview.stop());
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${preview.url}/admin/login`)).ok) { ready = true; break; } } catch {}
    await delay(100);
  }
  assert.ok(ready);
  const client = await request.newContext({ baseURL: preview.url });
  t.after(() => client.dispose());
  assert.equal((await client.get('/api/entry/posts?path=missing')).status(), 401);
  const html = await (await client.get('/admin/login')).text();
  let csrf = JSON.parse(html.match(/window\.__BOOT__ = (\{[^;]+\});/)[1]).csrfToken;
  const login = await client.post('/api/login', { headers: { 'X-CSRF-Token': csrf }, data: { username: 'preview', password: 'visual-preview-only' } });
  assert.equal(login.status(), 200);
  csrf = (await login.json()).csrfToken;
  const headers = { 'X-CSRF-Token': csrf };
  // 模拟浏览器统一入口：图片被保存为不同后缀，不能误拒或继续存成错误后缀。
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  const renamed = await client.post('/api/_', { headers: { ...headers, 'Content-Type': 'image/jpeg', 'X-Target': Buffer.from(encodeURIComponent('/api/upload?filename=cover.JPG')).toString('base64') }, data: png });
  assert.equal(renamed.status(), 200, await renamed.text());
  const image = await renamed.json();
  assert.match(image.name, /\.png$/);
  assert.deepEqual(await (await client.get(`/api/media/preview/${image.name}`)).body(), png);
  // 同名图片在同一毫秒到达也不能相互覆盖，且每个响应 URL 必须读回对应字节。
  const concurrent = await Promise.all(Array.from({ length: 20 }, async (_, index) => {
    const bytes = Buffer.concat([png, Buffer.from([index])]);
    const response = await client.post('/api/upload?filename=concurrent.png', { headers: { ...headers, 'Content-Type': 'application/octet-stream' }, data: bytes });
    assert.equal(response.status(), 200);
    return { bytes, name: (await response.json()).name };
  }));
  assert.equal(new Set(concurrent.map((item) => item.name)).size, concurrent.length, '并发上传必须使用独立文件名');
  for (const item of concurrent) assert.deepEqual(await (await client.get(`/api/media/preview/${item.name}`)).body(), item.bytes);
  for (const filename of ['fake.png', 'fake.jpg', 'fake.svg', 'fake.exe']) {
    assert.equal((await client.post(`/api/upload?filename=${filename}`, { headers: { ...headers, 'Content-Type': 'application/octet-stream' }, data: Buffer.from('<html>not an image</html>') })).status(), 400);
  }
  const invalidBuild = await client.post('/api/build', { headers, data: { label: 'x'.repeat(65) } });
  assert.equal(invalidBuild.status(), 400);
  assert.match((await invalidBuild.json()).error, /版本名称/);
  assert.equal(fs.existsSync(path.join(preview.sandbox, '.build-lock')), false);
  const editor = await (await client.get('/admin/notes/new')).text();
  assert.match(editor, /data-field="date"[^>]*aria-required="true"/);
  for (const url of ['/api/entry/posts?path=..%2F..%2F.env', '/api/entry/posts', '/api/entry/unknown?path=x']) {
    const response = await client.get(url);
    assert.equal(response.status(), 400, url);
    assert.doesNotMatch(JSON.stringify(await response.json()), /SESSION_SECRET|ADMIN_PASSWORD|stack/);
  }
  assert.equal((await client.get('/api/entry/posts?path=missing')).status(), 404);
  assert.equal((await client.post('/api/save/notes', { headers, data: { id: 'missing-date', fields: { title: '虚构随笔' }, body: '正文' } })).status(), 400);
  assert.equal(fs.existsSync(path.join(preview.sandbox, 'src/content/notes/missing-date.md')), false);
  const audio = await client.post('/api/manage/music/upload?filename=fake.mp3', { headers: { ...headers, 'Content-Type': 'application/octet-stream' }, data: Buffer.from('not audio') });
  assert.equal(audio.status(), 400);
  const oversized = await client.post('/api/manage/music/upload?filename=large.wav', { headers: { ...headers, 'Content-Type': 'application/octet-stream' }, data: Buffer.alloc(30 * 1024 * 1024 + 1) });
  assert.equal(oversized.status(), 413);
  assert.match((await oversized.json()).error, /音频.*30MB/);
  assert.equal((await client.post('/api/save/posts', { data: { id: 'denied' } })).status(), 403);
  const release = path.join(preview.sandbox, 'current');
  fs.mkdirSync(release); fs.writeFileSync(path.join(release, 'search.json'), '[]');
  assert.equal((await (await client.get('/api/public/site-stats')).json()).posts, 0);
  fs.writeFileSync(path.join(release, 'search.json'), JSON.stringify([{ url: '/posts/旧版本/' }]));
  assert.equal((await (await client.get('/api/public/site-stats')).json()).posts, 1);
});
