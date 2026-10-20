// 真实官方 SDK + 隔离官方服务的闭环回归，不写入真实博客或外部评论服务。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import { startPreview } from './preview-admin.mjs';

const frontPort = 4340;
const backendPort = 4422;
for (const port of [frontPort, backendPort]) await new Promise((resolve, reject) => {
  const probe = net.createServer(); probe.once('error', reject); probe.listen(port, '127.0.0.1', () => probe.close(resolve));
});
const preview = startPreview({ port: backendPort, quiet: true });
const server = spawn(process.execPath, ['node_modules/astro/bin/astro.mjs', 'dev', '--host', '127.0.0.1', '--port', String(frontPort), '--ignore-lock'], {
  stdio: 'ignore', windowsHide: true,
  env: { ...process.env, ADMIN_PORT: String(backendPort), ASTRO_DEV_BACKGROUND: '1', PUBLIC_TWIKOO_ENV_ID: '' },
});
const front = `http://127.0.0.1:${frontPort}`;
const out = path.resolve('docs/assets/spring-ui');
fs.mkdirSync(out, { recursive: true });
let browser;
let page;
const errors = [];
try {
  for (const url of [`${preview.url}/admin/login`, front]) {
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(url)).ok) break; } catch {}
      if (i === 99) throw Error(`隔离服务器未启动：${url}`);
      await delay(150);
    }
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, timezoneId: 'Asia/Shanghai' });
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${front}/notes/`);
  await page.locator('[data-cbox]').scrollIntoViewIfNeeded();
  await page.locator('.tk-textarea__inner').waitFor();
  assert.equal(await page.evaluate(() => window.twikoo.version), '2.0.15');
  const message = `官方 Twikoo 浏览器回归 ${Date.now()}`;
  await page.locator('.tk-meta-input input').nth(0).fill('隔离测试读者');
  await page.locator('.tk-meta-input input').nth(1).fill('reader@example.com');
  await page.locator('.tk-textarea__inner').fill(message);
  await page.locator('.tk-submit .tk-button--primary').click();
  await page.locator('.tk-comment .tk-content').filter({ hasText: message }).waitFor();
  console.log('✓ 官方 SDK 前台实际提交，公开列表展示同一条评论');
  await page.screenshot({ path: path.join(out, 'twikoo-public.png') });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('blog:quote-comment', { detail: { text: '引用到官方评论的回归片段', returnY: 123 } })));
  await page.waitForFunction(() => document.querySelector('.tk-textarea__inner')?.value.includes('> 引用到官方评论的回归片段'));
  await page.locator('.tk-submit .tk-button').filter({ hasText: '预览' }).click();
  await page.locator('.tk-preview-container blockquote').filter({ hasText: '引用到官方评论的回归片段' }).waitFor();
  await page.locator('.tk-textarea__inner').fill('');
  console.log('✓ 划词引用进入官方编辑器，原生预览正确渲染引用');

  const admin = await context.newPage();
  admin.on('pageerror', (error) => errors.push(error.message));
  await admin.goto(`${preview.url}/admin/login`);
  await admin.getByLabel('用户名', { exact: true }).fill('preview');
  await admin.getByLabel('密码', { exact: true }).fill('visual-preview-only');
  await admin.getByRole('button', { name: '登录', exact: true }).click();
  await admin.waitForURL(`${preview.url}/admin`);
  await admin.goto(`${preview.url}/admin/comments`);
  const row = admin.locator('#comment-rows tr').filter({ hasText: message });
  await row.waitFor();
  const id = await row.locator('[data-comment-reply]').getAttribute('data-comment-reply');
  await row.locator('[data-comment-reply]').click();
  await admin.locator('#cr-text').fill('来自博客后台的 Twikoo 回复');
  await admin.locator('#comment-reply-send').click();
  await admin.waitForTimeout(700);
  assert.equal(await admin.evaluate(() => window.__BOOT__.comments.some((comment) => 'uid' in comment || 'accessToken' in comment)), false);
  await page.reload();
  await page.locator('[data-cbox]').scrollIntoViewIfNeeded();
  await page.getByText('来自博客后台的 Twikoo 回复', { exact: true }).waitFor();
  console.log('✓ 博客后台可读取并回复前台评论，前台显示官方博主回复');

  const mutate = async (endpoint, body) => admin.evaluate(async ({ endpoint, body }) => {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.__BOOT__.csrfToken }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }, { endpoint, body });
  assert.equal((await mutate('/api/manage/comments/status', { id, status: 'hidden' })).status, 200);
  // Twikoo 会允许作者本人看到自己的待审评论；使用独立访客验证隐藏结果。
  const visitor = await browser.newContext();
  try {
    const other = await visitor.newPage();
    await other.goto(`${front}/notes/`);
    await other.locator('[data-cbox]').scrollIntoViewIfNeeded();
    await other.locator('.tk-textarea__inner').waitFor();
    await other.waitForTimeout(500);
    assert.equal(await other.locator('.tk-comment .tk-content').filter({ hasText: message }).count(), 0);
  } finally { await visitor.close(); }
  assert.equal((await mutate('/api/manage/comments/status', { id, status: 'visible' })).status, 200);
  console.log('✓ 后台审核隐藏对独立访客生效，可重新公开');

  await admin.goto(`${preview.url}/admin/twikoo`);
  const frame = admin.frameLocator('iframe[title="Twikoo 官方管理面板"]');
  await frame.locator('#twikoo-status').filter({ hasText: '博客登录已验证' }).waitFor();
  await frame.locator('#open-twikoo-admin').click();
  await frame.getByText('Twikoo 管理面板', { exact: true }).waitFor();
  assert.notEqual(await frame.locator('.tk-panel').evaluate((el) => getComputedStyle(el).color), 'rgb(255, 255, 255)');
  await frame.getByText('配置管理', { exact: true }).click();
  await frame.locator('.tk-admin-config-group summary').filter({ hasText: '通用' }).click();
  const placeholder = frame.locator('.tk-admin-config-item').filter({ has: frame.locator('[title="COMMENT_PLACEHOLDER"]') }).locator('input');
  await placeholder.fill('来自后台的 Twikoo 占位提示');
  const savedConfig = admin.waitForResponse((response) => response.url().endsWith('/api/manage/twikoo') && response.request().postDataJSON()?.event === 'SET_CONFIG');
  await frame.getByRole('button', { name: '保存', exact: true }).click();
  assert.equal((await (await savedConfig).json()).code, 0);
  await page.reload();
  await page.locator('[data-cbox]').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('.tk-textarea__inner')?.getAttribute('placeholder') === '来自后台的 Twikoo 占位提示');
  await frame.locator('.tk-admin-config-group summary').filter({ hasText: '通用' }).click();
  await frame.locator('.tk-admin').evaluate((el) => { el.scrollTop = 0; });
  await admin.evaluate(() => window.scrollTo(0, 0));
  await admin.screenshot({ path: path.join(out, 'twikoo-admin.png') });
  await admin.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await frame.locator('html[data-theme="dark"]').waitFor();
  await admin.waitForTimeout(600); // 官方面板的背景过渡结束后再比较最终颜色。
  const darkBackground = await frame.locator('.tk-admin').evaluate((el) => getComputedStyle(el).backgroundColor);
  await admin.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await frame.locator('html[data-theme="light"]').waitFor();
  await admin.waitForTimeout(600);
  assert.notEqual(await frame.locator('.tk-admin').evaluate((el) => getComputedStyle(el).backgroundColor), darkBackground);
  await admin.setViewportSize({ width: 390, height: 844 });
  // 等待侧栏的响应式收起动画完成，截图应展示实际可操作的手机界面。
  await admin.waitForFunction(() => document.querySelector('.sidebar').getBoundingClientRect().right <= 1);
  assert.equal(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  assert.equal(await frame.locator('html').evaluate((el) => el.scrollWidth <= innerWidth + 1), true);
  await admin.screenshot({ path: path.join(out, 'twikoo-admin-mobile.png') });
  await admin.setViewportSize({ width: 1440, height: 960 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-cbox]').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  assert.equal(await page.locator('.tk-meta-input').evaluate((el) => [...el.children].every((child) => child.getBoundingClientRect().right <= el.getBoundingClientRect().right + 1)), true);
  await page.screenshot({ path: path.join(out, 'twikoo-front-mobile.png') });
  await page.setViewportSize({ width: 1440, height: 960 });
  console.log('✓ 官方完整管理面板使用博客登录，无额外密码，可访问配置管理');

  const anonymous = await fetch(`${preview.url}/api/manage/twikoo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'GET_CONFIG_FOR_ADMIN' }) });
  assert.equal(anonymous.status, 401);
  const missingCsrf = await admin.evaluate(async () => (await fetch('/api/manage/twikoo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'COMMENT_GET_FOR_ADMIN', per: 10, page: 1 }) })).status);
  assert.equal(missingCsrf, 403);
  const publicAdmin = await fetch(`${preview.url}/api/public/twikoo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'SET_PASSWORD', password: 'not-allowed' }) });
  assert.equal(publicAdmin.status, 403);
  assert.equal((await mutate('/api/manage/comments/delete', { id })).status, 200);
  const remaining = await (await fetch(`${preview.url}/api/public/twikoo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'COMMENT_GET', url: '/notes/' }) })).json();
  assert.equal(remaining.data.some((item) => item.id === id), false);
  assert.deepEqual(errors, []);
  console.log('✓ 删除与回复清理、管理鉴权和公开初始化保护通过，无页面脚本异常');
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: path.join(out, 'twikoo-failure.png'), fullPage: true });
    console.log('Twikoo diagnostic:', await page.locator('[data-c-mount]').evaluate((el) => el.innerHTML.slice(0, 2200)).catch(() => 'no comment mount'));
    console.log('Page errors:', errors);
  }
  throw error;
} finally {
  await browser?.close();
  if (process.platform === 'win32') await new Promise((resolve) => spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('exit', resolve));
  else server.kill('SIGTERM');
  await preview.stop();
}
