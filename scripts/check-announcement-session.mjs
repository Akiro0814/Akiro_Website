// 直接运行真实 Astro 公告组件的脚本，使用本地 API、原生 dialog 和真实浏览器 Cookie。
import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { chromium } from '@playwright/test';

const source = fs.readFileSync(new URL('../src/components/AnnouncementBar.astro', import.meta.url), 'utf8');
const script = ts.transpileModule(source.match(/<script>([\s\S]*?)<\/script>/)[1], { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const markup = source.slice(source.indexOf('<dialog'), source.indexOf('</dialog>') + 9);
let mode = 'normal';
const server = http.createServer((req, res) => {
  if (req.url === '/api/public/announcements') {
    if (mode === 'fail') { res.writeHead(503); res.end('{}'); return; }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ items: mode === 'empty' ? [] : [1, 2].map((id) => ({ id: String(id), title: `公告 ${id}`, content: '虚构公告内容' })) }));
    return;
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><html><body>${markup}<a href="/next">下一页</a><script>${script}</script></body></html>`);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(base);
  await page.locator('dialog[open]').waitFor();
  await page.locator('[data-announce-next]').click();
  assert.equal(await page.locator('[data-announce-count]').textContent(), '2 / 2');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.locator('dialog').waitFor({ state: 'hidden' });
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('dialog').evaluate((el) => el.open), false, '刷新不能重复弹出公告');
  await page.locator('a').click();
  await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('dialog').evaluate((el) => el.open), false, '跨页不能重复弹出公告');
  const tab = await context.newPage();
  await tab.goto(base, { waitUntil: 'networkidle' });
  assert.equal(await tab.locator('dialog').evaluate((el) => el.open), false, '同会话新标签页不能重复弹出');
  const cookies = await context.cookies();
  assert.equal(cookies.find((c) => c.name === 'akiro_announcement_session').expires, -1, '公告标记必须是会话 Cookie');
  assert.equal(await page.locator('html').evaluate((el) => el.classList.contains('has-announcement')), false);
  await context.close();
  const fresh = await browser.newContext();
  const next = await fresh.newPage();
  await next.goto(base);
  await next.locator('dialog[open]').waitFor();
  await fresh.close();
  for (const failure of ['empty', 'fail']) {
    mode = failure;
    const retry = await browser.newContext();
    const p = await retry.newPage();
    await p.goto(base, { waitUntil: 'networkidle' });
    assert.equal((await retry.cookies()).some((c) => c.name === 'akiro_announcement_session'), false);
    mode = 'normal';
    await p.reload();
    await p.locator('dialog[open]').waitFor();
    await retry.close();
  }
  // 两个标签同时进入时，只有一个标签获得展示机会。
  const concurrent = await browser.newContext();
  const pages = await Promise.all([concurrent.newPage(), concurrent.newPage()]);
  await Promise.all(pages.map((p) => p.goto(base, { waitUntil: 'networkidle' })));
  assert.equal((await Promise.all(pages.map((p) => p.locator('dialog').evaluate((el) => el.open)))).filter(Boolean).length, 1);
  await concurrent.close();
  console.log('PASS 公告：首次、多条切换、Escape、刷新、跨页、多标签、新会话、空数据/请求失败重试与并发展示');
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
