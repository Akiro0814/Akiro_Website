// 独立评论浏览器闭环，仅写隔离夹具。
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
const out = path.resolve('docs/testing/comments');
fs.mkdirSync(out, { recursive: true });
let browser;
let page;
const errors = [];
try {
  for (const url of [`${preview.url}/admin/login`, front]) {
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(url)).ok) break; } catch {}
      if (i === 99) throw Error(`服务器未启动：${url}`);
      await delay(150);
    }
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, timezoneId: 'Asia/Shanghai' });
  page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${front}/notes/`); await page.waitForTimeout(800);
  await page.locator('[data-cbox]').scrollIntoViewIfNeeded();
  await page.locator('.ac-form').waitFor();
  assert.equal(await page.evaluate(() => Boolean(window.twikoo)), false);
  const message = `独立评论闭环 ${Date.now()}`;
  await page.getByLabel('昵称', { exact: false }).fill('隔离读者');
  await page.getByLabel('邮箱', { exact: false }).fill('reader@example.com');
  await page.locator('.ac-form textarea').fill(message);
  await page.getByRole('button', { name: '发表评论', exact: true }).click();
  await page.locator('.ac-content').filter({ hasText: message }).waitFor();
  await page.locator('.ac-device').filter({ hasText: /Chrome|Chromium/ }).first().waitFor();
  const item = page.locator('.ac-comment').filter({ has: page.locator('.ac-content').filter({ hasText: message }) }).first();
  const id = await item.getAttribute('data-comment-id');
  await item.locator('[data-like]').first().click();
  await page.waitForFunction(id => document.querySelector(`[data-like="${id}"] span`)?.textContent === '1', id);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('blog:quote-comment', { detail: { text: '划词引用验证', returnY: 123 } })));
  await page.waitForFunction(() => document.querySelector('.ac-form textarea')?.value.includes('> 划词引用验证'));
  await page.getByRole('button', { name: '预览', exact: true }).click();
  await page.locator('.ac-preview blockquote').filter({ hasText: '划词引用验证' }).waitFor();
  await page.locator('.ac-form textarea').fill('');
  await page.getByRole('button', { name: '预览', exact: true }).click();
  await page.locator('[data-cbox]').screenshot({ path: path.join(out, 'comments-desktop.png') });
  console.log('✓ 本站组件提交、UA 标签、点赞、划词引用与 Markdown 预览');
  const admin = await context.newPage(); admin.on('pageerror', error => errors.push(error.message));
  await admin.goto(`${preview.url}/admin/login`);
  await admin.getByLabel('用户名', { exact: true }).fill('preview');
  await admin.getByLabel('密码', { exact: true }).fill('visual-preview-only');
  await admin.getByRole('button', { name: '登录', exact: true }).click();
  await admin.waitForURL(`${preview.url}/admin`);
  await admin.goto(`${preview.url}/admin/comments`);
  const row = admin.locator('#comment-rows tr').filter({ hasText: message });
  await row.locator('[data-comment-reply]').click();
  await admin.locator('#cr-text').fill('独立系统站长回复');
  await admin.locator('#comment-reply-send').click();
  await delay(400);
  await page.reload(); await page.locator('[data-cbox]').scrollIntoViewIfNeeded();
  await page.locator('.ac-content').filter({ hasText: '独立系统站长回复' }).waitFor();
  await page.locator('.ac-master').waitFor();
  const mutate = (endpoint, body) => admin.evaluate(async ({ endpoint, body }) => {
    const response = await fetch('/api/_', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.__BOOT__.csrfToken, 'X-Target': btoa(encodeURIComponent(endpoint)) }, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  }, { endpoint, body });
  assert.equal((await mutate('/api/manage/comments/status', { id, status: 'hidden' })).status, 200);
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await page.locator(`[data-comment-id="${id}"]`).waitFor({ state: 'detached' });
  assert.equal(await page.getByText('独立系统站长回复', { exact: true }).count(), 0);
  assert.equal((await mutate('/api/manage/comments/status', { id, status: 'visible' })).status, 200);
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await page.locator(`[data-comment-id="${id}"]`).waitFor();
  console.log('✓ 后台回复、隐藏主楼和回复、恢复，即时同步且无需构建');
  await admin.goto(`${preview.url}/admin/comment-settings`);
  await admin.getByLabel('展示系统与浏览器', { exact: true }).uncheck();
  await admin.getByRole('button', { name: '保存评论设置', exact: true }).click();
  await admin.getByText('评论设置已保存，前台即时生效。', { exact: true }).waitFor();
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await page.locator('.ac-device').waitFor({ state: 'detached' });
  const download = admin.waitForEvent('download');
  await admin.getByRole('button', { name: '导出评论 JSON', exact: true }).click();
  const exported = await download; assert.match(exported.suggestedFilename(), /^akiro-comments/);
  await admin.locator('[data-comments-import]').setInputFiles({ name: 'comments.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([{ _id: 'fixture-import', nick: '导入读者', url: '/notes/', comment: '<p>导入示例</p>' }])) });
  await admin.getByText('导入完成，新增 1 条评论。', { exact: true }).waitFor();
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await page.locator('.ac-content').filter({ hasText: '导入示例' }).waitFor();
  // 只保存虚构通知参数；关闭通知开关后再操作，不能连接真实 SMTP 或推送服务。
  await mutate('/api/manage/comments/settings', { notifyOwner: false, notifyReply: false });
  const notificationForm = admin.locator('#comment-notifications-form');
  await notificationForm.locator('[name="SMTP_HOST"]').fill('smtp.example.test');
  await notificationForm.locator('[name="SMTP_PORT"]').fill('587');
  await notificationForm.locator('[name="SMTP_SECURE"]').selectOption('false');
  await notificationForm.locator('[name="SMTP_USER"]').fill('sender@example.test');
  await notificationForm.locator('[name="SMTP_PASS"]').fill('fixture-smtp-secret');
  await notificationForm.locator('[name="BLOGGER_EMAIL"]').fill('owner@example.test');
  await notificationForm.locator('[name="PUSHOO_CHANNEL"]').selectOption('serverchan');
  await notificationForm.locator('[name="PUSHOO_TOKEN"]').fill('SCTfixture-token');
  await admin.getByRole('button', { name: '保存通知配置', exact: true }).click();
  await admin.getByText('通知配置已保存，立即生效。', { exact: true }).waitFor();
  await admin.reload();
  assert.equal(await notificationForm.locator('[name="SMTP_HOST"]').inputValue(), 'smtp.example.test');
  assert.equal(await notificationForm.locator('[name="SMTP_PASS"]').inputValue(), '');
  assert.equal(await notificationForm.locator('[name="SMTP_PASS"]').getAttribute('placeholder'), '已配置，留空保留原值');
  assert.doesNotMatch(await admin.content(), /fixture-smtp-secret|SCTfixture-token/);
  await admin.locator('[data-comments-import]').setInputFiles({ name: 'chinese.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([{ _id: 'chinese-url', nick: '中文地址读者', url: '/posts/%E6%95%99%E7%A8%8B/%E4%B8%AD%E6%96%87/', comment: '<p>中文地址测试</p>' }])) });
  await admin.getByText('导入完成，新增 1 条评论。', { exact: true }).waitFor();
  await admin.goto(`${preview.url}/admin/comments`);
  await admin.getByText('/posts/教程/中文/', { exact: true }).waitFor();
  await admin.goto(`${preview.url}/admin/comment-settings`);
  await admin.setViewportSize({ width: 390, height: 844 });
  assert.equal(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  await admin.locator('#comment-notifications-form').screenshot({ path: path.join(out, 'comments-notification-settings-mobile.png') });
  await admin.locator('#comment-settings-form').screenshot({ path: path.join(out, 'comments-settings.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  await page.locator('[data-cbox]').screenshot({ path: path.join(out, 'comments-mobile.png') });
  const unauth = await fetch(`${preview.url}/api/manage/comments/export`); assert.equal(unauth.status, 401);
  const noCsrf = await admin.evaluate(async () => (await fetch('/api/manage/comments/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status); assert.equal(noCsrf, 403);
  assert.equal((await fetch(`${preview.url}/api/manage/comments/notifications`)).status, 401);
  const noNotificationCsrf = await admin.evaluate(async () => (await fetch('/api/manage/comments/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status); assert.equal(noNotificationCsrf, 403);
  const noToken = await fetch(`${preview.url}/api/public/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: '/notes/', nick: 'test', comment: 'forbidden' }) }); assert.equal(noToken.status, 400);
  assert.equal((await mutate('/api/manage/comments/delete', { id })).status, 200);
  const publicData = await (await fetch(`${preview.url}/api/public/comments?url=%2Fnotes%2F`)).json();
  assert.equal(publicData.items.some(c => c.id === id), false);
  assert.doesNotMatch(JSON.stringify(publicData), /reader@example|SMTP|votes|ua"/);
  assert.deepEqual(errors, []);
  console.log('✓ 设置保存、导出导入、移动端、鉴权、挑战校验、隐私与级联删除');
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(out, 'comments-failure.png'), fullPage: true });
  console.log('Page errors:', errors); console.log('Comment feedback:', await page.locator('.ac-feedback').textContent().catch(() => 'unavailable')); throw error;
} finally {
  await browser?.close();
  if (process.platform === 'win32') await new Promise(resolve => spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('exit', resolve));
  else server.kill('SIGTERM');
  await preview.stop();
}
