import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { startPreview } from './preview-admin.mjs';

// 所有写入只发生在临时预览工作区，绝不使用本机管理员密码或改写用户资料。
const preview = startPreview({ port: 4418, quiet: true });
const out = path.resolve('docs/assets/spring-ui');
fs.mkdirSync(out, { recursive: true });
let browser;
const errors = [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${preview.url}/admin/login`)).ok) break; } catch {}
    if (i === 79) throw new Error('隔离后台未启动');
    await delay(100);
  }
  const wallpaperDir = path.join(preview.sandbox, 'public', 'wallpapers');
  fs.mkdirSync(wallpaperDir);
  fs.writeFileSync(path.join(wallpaperDir, 'preview.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jzokAAAAASUVORK5CYII=', 'base64'));
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${preview.url}/admin/login`);
  await page.getByLabel('用户名', { exact: true }).fill('preview');
  await page.getByLabel('密码', { exact: true }).fill('visual-preview-only');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL(`${preview.url}/admin`);
  await page.locator('.nav__item[href="/admin/site-content"]').click();
  await page.waitForURL(`${preview.url}/admin/site-content`);
  await page.waitForFunction(() => document.querySelector('.main').dataset.motionScene === 'ready');
  assert.match(await page.locator('[data-wallpapers-status]').innerText(), /1 张图片/);
  assert.equal(await page.locator('[data-wallpapers-list] img').count(), 1);
  await page.locator('[data-presentation-key="author"]').fill('回归作者');
  assert.equal(await page.locator('[data-profile-preview="author"]').innerText(), '回归作者');
  assert.match(await page.locator('#studio-save-state').innerText(), /未保存/);
  await page.locator('.nav__item[href="/admin/posts"]').click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(page.url(), `${preview.url}/admin/site-content`);
  assert.equal(await page.locator('[data-presentation-key="author"]').inputValue(), '回归作者');
  const homeGroup = page.locator('.presentation-group').filter({ hasText: '首页分区与轮换内容' });
  await homeGroup.locator('summary').click();
  await page.locator('[data-presentation-key="writingTitle"]').fill('后台写入的首页标题');
  await page.locator('[data-presentation-key="showProjects"]').uncheck();
  await page.locator('[data-presentation-key="defaultStyle"]').selectOption('glass', { force: true });
  await page.locator('[data-presentation-key="wallpaperMode"]').selectOption('fixed', { force: true });
  await page.locator('#profile-save').click();
  await page.waitForFunction(() => document.querySelector('#profile-save').textContent === '已保存');
  const stored = JSON.parse(fs.readFileSync(path.join(preview.sandbox, 'data', 'profile.json'), 'utf8'));
  assert.equal(stored.presentation.author, '回归作者');
  assert.equal(stored.presentation.writingTitle, '后台写入的首页标题');
  assert.equal(stored.presentation.showProjects, false);
  assert.equal(stored.presentation.defaultStyle, 'glass');
  assert.equal(stored.presentation.wallpaperMode, 'fixed');
  assert.match(await page.locator('#studio-save-state').innerText(), /已保存/);
  console.log('✓ 后台真实保存配置、开关与背景模式，文案预览和保存状态正确');
  await page.reload();
  await page.locator('[data-presentation-key="author"]').waitFor();
  assert.equal(await page.locator('[data-presentation-key="author"]').inputValue(), '回归作者');
  assert.equal(await page.locator('[data-presentation-key="showProjects"]').isChecked(), false);
  await page.waitForFunction(() => document.querySelector('.main').dataset.motionScene === 'ready');
  await page.screenshot({ path: path.join(out, 'studio-settings.png') });
  await page.locator('.nav__item[href="/admin/posts"]').click();
  await page.waitForURL(`${preview.url}/admin/posts`);
  assert.equal(await page.locator('.main').getAttribute('data-motion-scene'), 'entering');
  await page.waitForFunction(() => document.querySelector('.main').dataset.motionScene === 'ready');
  await page.screenshot({ path: path.join(out, 'studio-posts.png') });
  console.log('✓ 页面真实进场动效会完成，刷新后配置仍保留');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.nav__item[href="/admin/site-content"]').click();
  await page.waitForURL(`${preview.url}/admin/site-content`);
  assert.equal(await page.locator('.main').getAttribute('data-motion-scene'), 'ready');
  assert.equal(await page.locator('.main').evaluate((el) => getComputedStyle(el).opacity), '1');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: path.join(out, 'studio-settings-mobile.png') });
  assert.deepEqual(errors, []);
  console.log('✓ 减少动态效果保持可见，390px 设置页无横向溢出，无浏览器脚本异常');
} finally {
  await browser?.close();
  await preview.stop();
}
