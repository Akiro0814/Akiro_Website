// 使用隔离数据验收，绝不向当前工作区的歌单、文章或真实发布写入。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { startPreview } from './preview-admin.mjs';

const preview = startPreview({ port: 4427, quiet: true });
const out = path.resolve('.test-tmp/admin-experience');
fs.mkdirSync(out, { recursive: true });
const tracks = Array.from({ length: 12 }, (_, i) => ({ id: `song-${i}`, title: `试听曲目 ${i + 1}`, artist: 'Akiro', source: 'netease', neteaseId: String(i + 1), enabled: true, order: i }));
fs.writeFileSync(path.join(preview.sandbox, 'data/music.json'), JSON.stringify({ tracks }));
const days = {}, uvSets = {};
for (let i = 0; i < 30; i++) {
  const date = new Date(Date.now() - i * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
  days[date] = { pv: i > 24 ? 0 : 40 + (i * 37 % 180) };
  uvSets[date] = Object.fromEntries(Array.from({ length: i > 24 ? 0 : 12 + (i * 7 % 35) }, (_, j) => [`visitor-${j}`, 1]));
}
fs.writeFileSync(path.join(preview.sandbox, 'data/stats.json'), JSON.stringify({ total: 4000, days, uvSets }));
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${preview.url}/admin/login`)).ok) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(`${preview.url}/admin/login`);
  await page.getByLabel('用户名', { exact: true }).fill('preview');
  await page.getByLabel('密码', { exact: true }).fill('visual-preview-only');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL(`${preview.url}/admin`);
  await page.locator('#dash-trend .chart-area--uv').waitFor();
  await page.waitForTimeout(1000);
  await page.locator('#dash-trend').screenshot({ path: path.join(out, 'trend-light.png') });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await page.locator('#dash-trend').screenshot({ path: path.join(out, 'trend-dark.png') });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await page.goto(`${preview.url}/admin/music`);
  assert.equal(await page.locator('[data-track-drag]').count(), 12, '每首歌需要拖动手柄');
  const order = () => page.locator('[data-track-row]').evaluateAll((rows) => rows.map((r) => r.dataset.trackRow));
  const before = await order();
  await page.locator('[data-track-drag]').first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const handle = await page.locator('[data-track-drag]').first().boundingBox();
  const target = await page.locator('[data-track-row]').nth(3).boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + 10, target.y + target.height / 2 + 5, { steps: 15 });
  await page.waitForTimeout(120);
  assert.equal(await page.locator('.music-drag-ghost').count(), 1);
  await page.mouse.up();
  await page.waitForTimeout(300);
  const after = await order();
  assert.notDeepEqual(after, before);
  assert.equal(after[3], before[0], JSON.stringify({ before, after, handle, target }));
  assert.match(await page.locator('#music-sort-status').innerText(), /未保存/);
  await page.locator('#music-reorder-save').click();
  await page.waitForFunction(() => document.querySelector('#music-sort-status').textContent.includes('已保存'));
  await page.reload();
  assert.deepEqual(await order(), after);
  // Escape 必须恢复拖动之前的完整顺序。
  await page.locator('[data-track-drag]').first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const cancelHandle = await page.locator('[data-track-drag]').first().boundingBox();
  await page.mouse.move(cancelHandle.x + 16, cancelHandle.y + 16);
  await page.mouse.down();
  await page.mouse.move(cancelHandle.x + 16, cancelHandle.y + 160, { steps: 12 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.waitForTimeout(300);
  assert.deepEqual(await order(), after);
  assert.equal(await page.locator('.music-drag-ghost').count(), 0);
  // 键盘排序以及失败后的重试，不能丢失待保存顺序。
  await page.locator('[data-track-drag]').first().focus();
  await page.keyboard.press('ArrowDown');
  const pending = await order();
  await page.route('**/api/_', (route) => {
    const target = decodeURIComponent(Buffer.from(route.request().headers()['x-target'] || '', 'base64').toString());
    return target === '/api/manage/music/reorder' ? route.fulfill({ status: 500, json: { error: '验收模拟保存失败' } }) : route.continue();
  });
  await page.locator('#music-reorder-save').click();
  await page.waitForFunction(() => document.querySelector('#music-sort-status').textContent.includes('保存失败'));
  assert.deepEqual(await order(), pending);
  await page.unroute('**/api/_');
  await page.locator('#music-reorder-save').click();
  await page.waitForFunction(() => document.querySelector('#music-sort-status').textContent.includes('已保存'));
  await page.screenshot({ path: path.join(out, 'music-desktop.png'), fullPage: true });
  for (const collection of ['posts', 'notes']) {
    await page.goto(`${preview.url}/admin/${collection}/new`);
    await page.waitForFunction(() => document.querySelector('.main').dataset.motionScene !== 'entering');
    assert.equal(await page.locator('.editor__side').isVisible(), true);
    assert.equal(await page.locator('.pearl-settings-drawer,.pearl-settings-scrim').count(), 0);
    await page.locator('#slug').fill(`inline-${collection}`);
    await page.locator('[data-field="draft"]').check();
    assert.equal(await page.locator('[data-field="draft"]').isChecked(), true);
    await page.locator('#body').fill('## 写作测试\n\n正文仍支持 Markdown。');
    assert.equal(await page.locator('#body').inputValue(), '## 写作测试\n\n正文仍支持 Markdown。');
    const spacing = await page.locator('.editor__canvas').evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft));
    assert.ok(spacing >= 20);
    await page.screenshot({ path: path.join(out, `${collection}-desktop.png`), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(700);
    assert.ok(await page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().right <= 1), '手机写作时侧栏应收起');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(out, `${collection}-mobile.png`), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  assert.deepEqual(errors, []);
  console.log(`后台体验验收通过；截图：${out}`);
} finally {
  await browser?.close();
  await preview.stop();
}
