import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { startPreview } from '../scripts/preview-admin.mjs';

test('运行中的隔离服务即时读取新增和删除的中文壁纸，返回原始字节并拒绝恶意路径', { timeout: 30000 }, async (t) => {
  const preview = startPreview({ port: 4416, quiet: true });
  t.after(() => preview.stop());
  const endpoint = `${preview.url}/api/public/wallpapers`;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch(endpoint)).ok) { ready = true; break; } } catch { /* 等待独立进程监听 */ }
    await delay(100);
  }
  assert.equal(ready, true, '隔离后台必须正常启动');
  assert.deepEqual((await (await fetch(endpoint)).json()).items, []);
  const dir = path.join(preview.sandbox, 'public', 'wallpapers');
  fs.mkdirSync(dir);
  const name = '测试风景 #01.PNG';
  const bytes = Buffer.from('89504e470d0a1a0a', 'hex');
  fs.writeFileSync(path.join(dir, name), bytes);
  const url = `/wallpapers/${encodeURIComponent(name)}`;
  const listing = await fetch(endpoint);
  assert.equal(listing.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await listing.json()).items, [url]);
  const image = await fetch(`${preview.url}/api/public${url}`);
  assert.equal(image.status, 200);
  assert.match(image.headers.get('content-type'), /image\/png/);
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), bytes);
  for (const bad of ['%2e%2e%2fprofile.jpg', '%2e%2e%5cprofile.jpg', 'missing.png', 'unsafe.svg', '%2Fetc%2Fpasswd']) {
    const response = await fetch(`${endpoint}/${bad}`);
    assert.equal(response.status, 404, bad);
  }
  fs.unlinkSync(path.join(dir, name));
  assert.deepEqual((await (await fetch(endpoint)).json()).items, []);
  assert.equal((await fetch(`${preview.url}/api/public${url}`)).status, 404);
});
