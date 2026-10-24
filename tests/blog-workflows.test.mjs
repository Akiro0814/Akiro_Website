// 全模块写入只在 startPreview 的临时博客内执行，包含删除、回收站和配置回读。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, request } from '@playwright/test';
import { startPreview } from '../scripts/preview-admin.mjs';

test('隔离博客全模块操作：内容回收、页面、导航友链、项目公告、音乐媒体、评论、备份与退出', { timeout: 120000 }, async (t) => {
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const preview = startPreview({ port, quiet: true });
  t.after(() => preview.stop());
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${preview.url}/admin/login`)).ok) break; } catch {}
    await delay(100);
  }
  const client = await request.newContext({ baseURL: preview.url });
  t.after(() => client.dispose());
  const html = await (await client.get('/admin/login')).text();
  let csrf = JSON.parse(html.match(/window\.__BOOT__ = (\{[^;]+\});/)[1]).csrfToken;
  const login = await client.post('/api/login', { headers: { 'X-CSRF-Token': csrf }, data: { username: 'preview', password: 'visual-preview-only', remember: true } });
  assert.equal(login.status(), 200);
  csrf = (await login.json()).csrfToken;
  const headers = { 'X-CSRF-Token': csrf };
  const get = async (url) => {
    const response = await client.get(url);
    assert.equal(response.status(), 200, `${url}: ${await response.text()}`);
    return response.json();
  };
  const post = async (url, data) => {
    const response = await client.post(url, { headers, data });
    assert.equal(response.status(), 200, `${url}: ${await response.text()}`);
    const body = await response.json();
    assert.notEqual(body.ok, false, JSON.stringify(body));
    return body;
  };

  // 每个可编辑内容字段都写入并读取；草稿、置顶、分类标签与中文嵌套路径也覆盖。
  for (const collection of ['posts', 'notes']) {
    const id = '回归/操作测试';
    const fields = { title: '完整测试', date: '2026-10-21 12:34', description: '简介', cover: '/covers/test.png', categories: ['技术', '生活'], tags: ['中文', '测试'], draft: true, sticky: 2, comment: true };
    await post(`/api/save/${collection}`, { id, fields, body: '## 第一节\n\n**粗体**与[链接](https://example.com)' });
    assert.equal((await get(`/api/entry/${collection}?path=${encodeURIComponent(id)}`)).entry.data.title, fields.title);
    const renamed = id + '-改名';
    await post(`/api/save/${collection}`, { id: renamed, originalId: id, fields: { ...fields, draft: false, title: '修改后' }, body: '修改正文' });
    assert.equal((await client.get(`/api/entry/${collection}?path=${encodeURIComponent(id)}`)).status(), 404);
    assert.equal((await get(`/api/entry/${collection}?path=${encodeURIComponent(renamed)}`)).entry.body.trim(), '修改正文');
    await post(`/api/delete/${collection}`, { id: renamed });
    let trash = (await get(`/api/trash/${collection}`)).items;
    assert.equal(trash.length, 1);
    await post('/api/trash/restore', { collection, file: trash[0].file });
    assert.equal((await get(`/api/entry/${collection}?path=${encodeURIComponent(renamed)}`)).entry.data.title, '修改后');
    await post(`/api/delete/${collection}`, { id: renamed });
    trash = (await get(`/api/trash/${collection}`)).items;
    await post('/api/trash/purge', { collection, file: trash[0].file });
    assert.equal((await get(`/api/trash/${collection}`)).items.length, 0);
    await post(`/api/save/${collection}`, { id, fields, body: '清空回收站' });
    await post(`/api/delete/${collection}`, { id });
    await post('/api/trash/purge', { collection, all: true });
    assert.equal((await get(`/api/trash/${collection}`)).items.length, 0);
  }
  assert.match((await post('/api/preview', { markdown: '# 预览\n\n**测试**' })).html, /<strong>测试<\/strong>/);

  const profile = (await get('/api/manage/profile')).profile;
  await post('/api/manage/profile', { profile: { ...profile, hero: { ...profile.hero, title: '回归首页' } } });
  assert.equal((await get('/api/manage/profile')).profile.hero.title, '回归首页');
  const nav = { categories: [{ id: 'qa-nav', name: '测试导航', links: [{ name: '示例', url: 'https://example.com', desc: '说明' }] }] };
  await post('/api/manage/nav', { nav });
  assert.equal((await get('/api/manage/nav')).nav.categories[0].links[0].url, 'https://example.com');
  await post('/api/manage/friends/notice', { notice: '测试申请须知' });
  assert.equal((await get('/api/manage/friends')).notice, '测试申请须知');
  await post('/api/public/friends/apply', { name: '申请测试', url: 'https://qa.example.com', email: 'qa@example.com', desc: '申请说明' });
  const friend = (await get('/api/manage/friends')).items.find((item) => item.url === 'https://qa.example.com');
  assert.equal(friend.status, 'pending');
  for (const status of ['approved', 'rejected', 'pending']) {
    await post('/api/manage/friends/review', { id: friend.id, status });
    assert.equal((await get('/api/manage/friends')).items.find((item) => item.id === friend.id).status, status);
  }
  await post('/api/manage/friends/save', { ...friend, name: '编辑友链', status: 'approved' });
  await post('/api/manage/friends/delete', { id: friend.id });
  assert.equal((await get('/api/manage/friends')).items.some((item) => item.id === friend.id), false);

  let project = (await post('/api/manage/projects/save', { title: '项目测试', slug: 'qa-project', subtitle: '副标题', description: '简介', status: '开发中', tech: ['Astro'], links: [{ label: '访问', url: 'https://example.com' }], featured: true, order: 10, content: '## 项目正文' })).project;
  project = (await post('/api/manage/projects/save', { ...project, title: '修改项目', status: '已上线' })).project;
  assert.equal((await get('/api/manage/projects')).items.find((item) => item.id === project.id).title, '修改项目');
  await post('/api/manage/projects/delete', { id: project.id });
  assert.equal((await get('/api/manage/projects')).items.some((item) => item.id === project.id), false);
  const announcement = (await post('/api/manage/announcements/save', { title: '公告测试', content: '内容', enabled: true, link: 'https://example.com', startAt: Date.now() - 1000, endAt: Date.now() + 3600000 })).item;
  await post('/api/manage/announcements/save', { ...announcement, enabled: false });
  assert.equal((await get('/api/manage/announcements')).items.find((item) => item.id === announcement.id).enabled, false);
  await post('/api/manage/announcements/delete', { id: announcement.id });
  await post('/api/manage/site-meta', { since: '2024-02-29' });
  assert.equal((await get('/api/manage/site-meta')).meta.since, '2024-02-29');
  assert.equal((await client.post('/api/manage/site-meta', { headers, data: { since: '2026-02-30' } })).status(), 400);
  await post('/api/backup/config', { remoteUrl: 'https://example.com/test-backup.git' });
  assert.equal((await get('/api/backup/config')).remoteUrl, 'https://example.com/test-backup.git');
  await post('/api/backup/config', { remoteUrl: '' });
  assert.equal((await client.post('/api/backup/config', { headers, data: { remoteUrl: '--upload-pack=evil' } })).status(), 400);

  const wav = Buffer.alloc(48);
  wav.write('RIFF'); wav.writeUInt32LE(40, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(4, 40);
  const tracks = [];
  for (const title of ['曲目一', '曲目二']) {
    const response = await client.post(`/api/manage/music/upload?filename=qa.wav&title=${encodeURIComponent(title)}`, { headers: { ...headers, 'Content-Type': 'application/octet-stream' }, data: wav });
    assert.equal(response.status(), 200, await response.text());
    tracks.push((await response.json()).track);
  }
  await post('/api/manage/music/update', { id: tracks[0].id, title: '曲目修改', artist: '测试歌手', enabled: false });
  await post('/api/manage/music/reorder', { ids: tracks.map((item) => item.id).reverse() });
  assert.equal((await get('/api/manage/music')).tracks[0].id, tracks[1].id);
  const audio = await client.get(`/api/manage/music-preview/file/${tracks[0].fileName}`, { headers: { Range: 'bytes=0-3' } });
  assert.equal(audio.status(), 206); assert.equal((await audio.body()).toString(), 'RIFF');
  for (const track of tracks) await post('/api/manage/music/delete', { id: track.id });
  assert.equal((await get('/api/manage/music')).tracks.length, 0);

  // 实际浏览器点击封面上传、选择文件、保存文章，覆盖统一入口的二进制链路。
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext({ storageState: await client.storageState() });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${preview.url}/admin/posts/new`, { waitUntil: 'networkidle' });
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-upload-target="field-cover"]').click();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  await (await chooser).setFiles({ name: '错误后缀.jpg', mimeType: 'image/jpeg', buffer: png });
  await page.waitForFunction(() => document.querySelector('#field-cover').value.endsWith('.png'));
  const cover = await page.locator('#field-cover').inputValue();
  // Markdown 工具栏逐键验收，不只检查按钮存在。
  for (const [format, expected] of [['bold', '**样例**'], ['italic', '*样例*'], ['code', '`样例`'], ['link', '[样例](https://)'], ['quote', '> 样例'], ['list', '- 样例'], ['heading', '## 样例']]) {
    await page.locator('#body').fill('样例');
    await page.locator('#body').evaluate((el) => { el.focus(); el.setSelectionRange(0, el.value.length); });
    await page.locator(`[data-fmt="${format}"]`).click();
    assert.equal(await page.locator('#body').inputValue(), expected);
  }
  await page.locator('#body').fill('');
  // 插图的 4 种尺寸 × 3 种对齐全部生成正文并在真实预览中渲染图注。
  for (const size of ['33', '50', '75', '100']) {
    for (const align of ['left', 'center', 'right']) {
      await page.locator('#body').evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await page.locator('#img-insert-btn').click();
      await page.locator('.img-gallery__item').first().click();
      await page.locator(`[data-size="${size}"]`).click();
      await page.locator(`[data-align="${align}"]`).click();
      await page.locator('#img-caption').fill(`图注 ${size} ${align}`);
      await page.locator('#img-insert').click();
      assert.ok((await page.locator('#body').inputValue()).includes(`post-figure--${align} post-figure--w${size}`));
    }
  }
  const illustrated = await page.locator('#body').inputValue();
  await page.locator('#body').focus();
  await page.keyboard.press('Control+z');
  assert.notEqual(await page.locator('#body').inputValue(), illustrated);
  await page.keyboard.press('Control+y');
  assert.equal(await page.locator('#body').inputValue(), illustrated);
  await page.locator('[data-tab="preview"]').click();
  await page.waitForFunction(() => document.querySelectorAll('#preview figcaption').length === 12);
  await page.locator('[data-tab="write"]').click();
  await page.locator('[data-field="title"]').fill('浏览器封面验收');
  await page.locator('#slug').fill('browser-cover');
  await page.locator('#body').fill('封面上传后保存验证。');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.waitForURL(`${preview.url}/admin/posts`);
  assert.equal((await get('/api/entry/posts?path=browser-cover')).entry.data.cover, cover);
  assert.equal((await client.post('/api/media/delete', { headers, data: { name: path.basename(cover) } })).status(), 409);
  await post('/api/save/posts', { id: 'browser-cover', originalId: 'browser-cover', fields: { cover: '' }, body: '取消封面' });
  await post('/api/media/delete', { name: path.basename(cover) });
  assert.deepEqual(errors, []);
  // 逐页建立控件清单，并实际切换全部原生下拉选项/复选框，防止未覆盖选项被遗漏。
  const inventory = [];
  for (const route of ['', 'posts', 'notes', 'posts/new', 'notes/new', 'media', 'site-content', 'projects', 'links', 'music', 'announcements', 'comments', 'comment-settings', 'site-stats', 'build']) {
    await page.goto(`${preview.url}/admin${route ? '/' + route : ''}`, { waitUntil: 'networkidle' });
    inventory.push({ route, controls: await page.locator('main input,main textarea,main select,main button,.main input,.main textarea,.main select,.main button').evaluateAll((elements) => elements.map((el) => ({ tag: el.tagName, type: el.getAttribute('type'), id: el.id, field: el.getAttribute('data-field'), label: el.getAttribute('aria-label') || el.textContent.trim().slice(0, 80), options: el.tagName === 'SELECT' ? [...el.options].map((o) => o.value) : undefined }))) });
    for (const select of await page.locator('select:visible').all()) {
      const original = await select.inputValue();
      for (const option of await select.locator('option').evaluateAll((options) => options.filter((o) => !o.disabled).map((o) => o.value))) await select.selectOption(option);
      await select.selectOption(original);
    }
    for (const checkbox of await page.locator('input[type="checkbox"]:visible').all()) {
      const checked = await checkbox.isChecked();
      await checkbox.setChecked(!checked);
      await checkbox.setChecked(checked);
    }
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 960 });
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `页面横向溢出 ${route} ${width}`);
    }
    await page.setViewportSize({ width: 1440, height: 960 });
  }
  fs.mkdirSync(path.resolve('.test-tmp/full-audit'), { recursive: true });
  fs.writeFileSync(path.resolve('.test-tmp/full-audit/admin-controls.json'), JSON.stringify(inventory, null, 2));
  assert.deepEqual(errors, []);
  await context.close();

  // 导出需要博客登录；公开设置不包含通知密钥。
  const config = await get('/api/manage/comments/settings');
  assert.equal(config.settings.showDevice, true); assert.equal(config.notificationConfig, undefined);
  const exported = await get('/api/manage/comments/export');
  assert.equal(exported.version, 1);
  for (const endpoint of ['/api/manage/dashboard', '/api/manage/stats', '/api/manage/comments', '/api/media', '/api/build/status']) await get(endpoint);
  await post('/api/public/view', { path: '/qa/', title: '测试访问' });
  await post('/api/logout', {});
  assert.equal((await client.get('/api/manage/profile')).status(), 401);
  assert.equal((await client.get('/api/list/posts')).status(), 401);
  // 在测试证据中仅记布尔完成值，不写 cookie 或凭据。
  fs.mkdirSync(path.resolve('.test-tmp/full-audit'), { recursive: true });
  fs.writeFileSync(path.resolve('.test-tmp/full-audit/workflows.json'), JSON.stringify({ passed: true, modules: ['auth', 'posts', 'notes', 'trash', 'preview', 'profile', 'nav', 'friends', 'projects', 'announcements', 'site-meta', 'backup-config', 'music', 'cover-upload', 'media', 'comments-export', 'dashboard', 'stats', 'logout'] }, null, 2));
});
