// Browser regression for the post-migration polish. API writes are disabled.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { runInPublicFixture } from './lib/public-ui-fixture.mjs';

await runInPublicFixture(import.meta.url);

const port = Number(process.env.UI_POLISH_PORT || 4331);
const base = `http://127.0.0.1:${port}`;
const out = path.resolve('docs/assets/spring-ui');
const failures = [];
let checks = 0;
let browser;
let server;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cacheFile = path.resolve('src/data/github-projects.json');
const cacheStamp = () => fs.statSync(cacheFile).mtimeMs;
async function verifyPortFree() {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      await new Promise((resolve, reject) => {
        const probe = net.createServer();
        probe.once('error', reject);
        probe.listen(port, '127.0.0.1', () => probe.close(resolve));
      });
      return;
    } catch (error) {
      if (attempt === 29) throw error;
      await delay(100);
    }
  }
}
async function check(label, fn) {
  try { await fn(); checks++; console.log(`✓ ${label}`); }
  catch (error) { failures.push(label); console.log(`✗ ${label}: ${error.stack || error.message}`); }
}
async function appearance(page, style) {
  await page.locator('[data-style-toggle]').click();
  await page.locator('#style-console').waitFor({ state: 'visible' });
  await page.locator('button[data-style-mode="manual"]').click();
  await page.locator(`[data-style-choice="${style}"]`).click();
  await page.keyboard.press('Escape');
  await page.locator('#style-console').waitFor({ state: 'hidden' });
}
async function theme(page, value) {
  if (await page.locator('html').getAttribute('data-theme') !== value) {
    await page.locator('[data-theme-toggle]').click();
    await page.waitForFunction((expected) => document.documentElement.dataset.theme === expected, value);
  }
  await page.waitForTimeout(650);
}

try {
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', () => reject(Error(`Port ${port} already in use`)));
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
  server = spawn(process.execPath, ['node_modules/astro/bin/astro.mjs', 'dev', '--host', '127.0.0.1',
    '--port', String(port), '--ignore-lock'], { stdio: 'ignore', windowsHide: true,
    env: { ...process.env, ASTRO_DEV_BACKGROUND: '1' } });
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(base)).ok) break; } catch {}
    if (i === 119) throw Error('Astro did not start');
    await delay(250);
  }
  fs.mkdirSync(out, { recursive: true });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, timezoneId: 'Asia/Shanghai' });
  await context.addInitScript(() => {
    sessionStorage.setItem('blog-api-down-at', String(Date.now()));
    window.__polishNonce = crypto.randomUUID();
    window.__polishSwaps = 0;
    document.addEventListener('astro:before-swap', () => window.__polishSwaps++);
  });
  await context.route('**/api/**', (route) => route.fulfill({ status: 503, body: 'QA: API disabled' }));
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  const loads = [];
  const requests = [];
  let reloadSignals = 0;
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) loads.push(new URL(frame.url()).pathname); });
  page.on('request', (request) => { if (new URL(request.url()).pathname === '/about/')
    requests.push({ type: request.resourceType(), navigation: request.isNavigationRequest() }); });
  page.on('websocket', (socket) => socket.on('framereceived', ({ payload }) => {
    if (String(payload).includes('"type":"full-reload"')) reloadSignals++;
  }));
  await page.goto(base);
  await page.waitForTimeout(1600);

  // Hover first: no click, no injected fetch, no cache mutation from the test.
  await check('About hover does not reload or mutate the GitHub source cache', async () => {
    const nonce = await page.evaluate(() => window.__polishNonce);
    const stamp = cacheStamp();
    const loadCount = loads.length;
    const requestCount = requests.length;
    const signalCount = reloadSignals;
    await page.locator('.atlas-nav__links a[href="/about/"]').hover();
    await page.waitForTimeout(7000);
    const after = await page.evaluate(() => ({ nonce: window.__polishNonce, swaps: window.__polishSwaps,
      navigation: performance.getEntriesByType('navigation')[0]?.type }));
    const evidence = { documentChanged: nonce !== after.nonce, documentNavigations: loads.length - loadCount,
      swaps: after.swaps, navigation: after.navigation, fullReloadSignals: reloadSignals - signalCount,
      aboutRequests: requests.slice(requestCount), sourceCacheWritten: cacheStamp() !== stamp };
    console.log(`About hover evidence: ${JSON.stringify(evidence)}`);
    assert.equal(evidence.documentChanged, false, 'Hover replaced the document');
    assert.equal(evidence.documentNavigations, 0, 'Hover initiated a top-frame navigation');
    assert.equal(evidence.sourceCacheWritten, false, 'Rendering about rewrote a watched source file');
  });
  await check('System pointer and appearance dialog work without custom cursor', async () => {
    await page.goto(base);
    assert.equal(await page.locator('#smooth-cursor,[data-cursor-setting],#cursor-tab').count(), 0);
    assert.notEqual(await page.locator('body').evaluate((el) => getComputedStyle(el).cursor), 'none');
    await page.locator('[data-style-toggle]').click();
    await page.locator('#style-console').waitFor({ state: 'visible' });
    await page.locator('[data-style-choice="glass"]').click();
    await page.keyboard.press('Escape');
    await page.goto(base + '/friends/');
    assert.equal(await page.locator('.friend-form input').first().evaluate((el) => getComputedStyle(el).cursor), 'text');
    await page.goto(base);
  });
  await check('Navbar avatar uses the same image as favicon', async () => {
    await page.goto(base);
    const avatar = page.locator('.atlas-brand img');
    assert.equal(await avatar.count(), 1, 'Navbar must render an avatar image');
    const urls = await page.evaluate(() => ({ avatar: document.querySelector('.atlas-brand img').src,
      icon: document.querySelector('link[rel="icon"]').href }));
    assert.equal(urls.avatar, urls.icon);
  });
  await check('Glass cards use a translucent background and actual backdrop filtering', async () => {
    await appearance(page, 'glass');
    const card = page.locator('.atlas-writing-card').first();
    await card.scrollIntoViewIfNeeded();
    const styles = await card.evaluate((el) => ({ background: getComputedStyle(el).backgroundColor,
      backdrop: getComputedStyle(el).backdropFilter }));
    assert.notEqual(styles.backdrop, 'none');
    const alpha = styles.background.match(/\/\s*([\d.]+)\s*\)$/)
      || styles.background.match(/rgba\([^)]*,\s*([\d.]+)\)$/);
    assert.ok(alpha && Number(alpha[1]) < .95, `Glass background must be translucent: ${styles.background}`);
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(out, 'polish-glass.png') });
  });
  await check('Smiley Sans is downloaded and applies to public navigation and body', async () => {
    const fonts = await page.evaluate(async () => {
      const loaded = await document.fonts.load('16px "Smiley Sans"', '你好 Akiro');
      return { loaded: loaded.some((font) => font.status === 'loaded'),
        check: document.fonts.check('16px "Smiley Sans"', '你好 Akiro'),
        body: getComputedStyle(document.body).fontFamily,
        nav: getComputedStyle(document.querySelector('.atlas-nav')).fontFamily };
    });
    assert.equal(fonts.loaded, true, 'Smiley Sans face did not load');
    assert.equal(fonts.check, true);
    assert.match(fonts.body, /^['"]?Smiley Sans/);
    assert.match(fonts.nav, /^['"]?Smiley Sans/);
  });
  await check('Article heading and friend form use Smiley Sans', async () => {
    await page.goto(base);
    const article = await page.locator('a[href^="/posts/"]').first().getAttribute('href');
    assert.ok(article, 'A real published article is required');
    await page.goto(`${base}${article}`);
    assert.match(await page.locator('.article__header h1').evaluate((el) => getComputedStyle(el).fontFamily), /^['"]?Smiley Sans/);
    await page.goto(`${base}/friends/`);
    assert.match(await page.locator('.friend-form input').first().evaluate((el) => getComputedStyle(el).fontFamily), /^['"]?Smiley Sans/);
  });
  await check('Comment textarea and submit follow the active theme', async () => {
    await page.goto(`${base}/about/`);
    const comment = page.locator('[data-cbox]');
    // About may deliberately have no comment thread; use the existing notes page.
    if (!await comment.count()) await page.goto(`${base}/notes/`);
    await page.locator('[data-cbox]').scrollIntoViewIfNeeded();
    await page.locator('.ac-form textarea').waitFor();
    await page.locator('.ac-form textarea').fill('UI QA preview only');
    await page.locator('.ac-form [type="submit"]').waitFor({ state: 'visible' });
    const styles = await page.evaluate(() => {
      const text = document.querySelector('.ac-form textarea');
      const send = document.querySelector('.ac-form [type="submit"]');
      const probe = document.createElement('span'); probe.style.color = 'var(--text)'; document.body.append(probe);
      const expectedText = getComputedStyle(probe).color; probe.remove();
      return { color: getComputedStyle(text).color, expectedText, font: getComputedStyle(text).fontFamily,
        sendFont: getComputedStyle(send).fontFamily, buttonColor: getComputedStyle(send).color,
        buttonBackground: getComputedStyle(send).backgroundColor };
    });
    assert.equal(styles.color, styles.expectedText);
    assert.match(styles.font, /^['"]?Smiley Sans/);
    assert.match(styles.sendFont, /^['"]?Smiley Sans/);
    assert.notEqual(styles.buttonColor, styles.buttonBackground, 'Submit label must contrast with its background');
    for (const style of ['life', 'swiss', 'minimalist', 'glass', 'brutalist']) {
      await appearance(page, style);
      const backgrounds = [];
      for (const mode of ['light', 'dark']) {
        await theme(page, mode);
        const sample = await page.locator('.ac-form textarea').evaluate((el) => ({
          background: getComputedStyle(el).backgroundColor, font: getComputedStyle(el).fontFamily,
          fits: el.getBoundingClientRect().right <= document.documentElement.clientWidth + 1 }));
        assert.match(sample.font, /^['"]?Smiley Sans/);
        assert.equal(sample.fits, true, `${style}/${mode} comment textarea must fit the viewport`);
        backgrounds.push(sample.background);
      }
      assert.notEqual(backgrounds[0], backgrounds[1], `${style} comment surface must respond to light/dark`);
    }
    await appearance(page, 'life');
    await theme(page, 'light');
    await page.screenshot({ path: path.join(out, 'polish-comments.png') });
  });
  await check('Restore site defaults clears visitor overrides and reapplies site appearance', async () => {
    await page.locator('[data-style-toggle]').click();
    await page.locator('[data-style-reset]').click();
    const value = await page.evaluate(() => ({
      style: document.documentElement.dataset.style,
      expected: document.documentElement.dataset.defaultStyle,
      theme: document.documentElement.dataset.themeMode,
      expectedTheme: document.documentElement.dataset.defaultTheme,
      appearanceSaved: localStorage.getItem('akiro-appearance'),
      themeSaved: localStorage.getItem('blog-theme'),
    }));
    assert.equal(value.style, value.expected);
    assert.equal(value.theme, value.expectedTheme);
    assert.equal(value.appearanceSaved, null);
    assert.equal(value.themeSaved, null);
    await page.keyboard.press('Escape');
  });
  await check('Announcement floats without shifting the hero, avoids the player and remembers dismissal', async () => {
    // 独立浏览器上下文绕过上面故意关闭 API 的场景，所有接口仍由本地夹具响应。
    const announcements = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    try {
      await announcements.route('**/api/**', (route) => {
        const url = new URL(route.request().url());
        const target = url.searchParams.has('r') ? decodeURIComponent(Buffer.from(url.searchParams.get('r'), 'base64').toString()) : url.pathname;
        const payload = target === '/api/public/announcements'
          ? { items: [{ id: 'qa-announcement', title: '欢迎来到 Akiro', content: '这是公告浮层验收。\n长文本会正常换行，首页的风景仍然完整。', link: 'https://example.com/news' }] }
          : target === '/api/public/playlist'
            ? { tracks: [{ id: 'qa-song', source: 'netease', neteaseId: '1', title: '测试曲目', artist: 'Akiro' }] }
            : { ok: true, items: [], total: 0, today: 0 };
        return route.fulfill({ status: 200, json: payload });
      });
      const news = await announcements.newPage();
      news.on('pageerror', (error) => runtimeErrors.push(error.message));
      await news.goto(base);
      await news.locator('[data-announce]').waitFor({ state: 'visible' });
      await news.waitForTimeout(700);
      assert.equal(await news.locator('[data-announce]').evaluate((el) => getComputedStyle(el).position), 'fixed');
      const hero = await news.locator('.atlas-hero').evaluate((el) => {
        const before = el.getBoundingClientRect().top;
        const bar = document.querySelector('[data-announce]');
        bar.hidden = true;
        const after = el.getBoundingClientRect().top;
        bar.hidden = false;
        return { before, after };
      });
      assert.equal(hero.before, hero.after);
      await news.waitForTimeout(350);
      await news.screenshot({ path: path.join(out, 'announcement-desktop.png') });
      await news.locator('[data-music-toggle]').click();
      const bounds = await news.locator('[data-announce]').boundingBox();
      const panel = await news.locator('[data-music-panel]').boundingBox();
      assert.ok(bounds.x + bounds.width <= panel.x, '公告应避让已展开的播放器');
      await news.locator('[data-music-close]').click();
      await news.setViewportSize({ width: 390, height: 844 });
      await news.waitForTimeout(400);
      const mobileBounds = await news.locator('[data-announce]').boundingBox();
      assert.ok(mobileBounds.x >= 0 && mobileBounds.x + mobileBounds.width <= 390);
      await news.screenshot({ path: path.join(out, 'announcement-mobile.png') });
      await news.locator('[data-announce-close]').click();
      await news.locator('[data-announce]').waitFor({ state: 'hidden' });
      await news.reload();
      await news.waitForTimeout(500);
      assert.equal(await news.locator('[data-announce]').isVisible(), false);
    } finally { await announcements.close(); }
  });
  await check('No first-party JavaScript runtime exceptions', async () => assert.deepEqual(runtimeErrors, []));
  console.log(`UI polish: ${checks} checks passed, ${failures.length} failed`);
  if (failures.length) process.exitCode = 1;
} finally {
  await browser?.close();
  if (server) {
    const stop = spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    await new Promise((resolve) => stop.once('exit', resolve));
  }
  // Binding the same port proves the owned preview is no longer listening.
  await verifyPortFree();
  console.log(`Preview cleanup verified: port ${port} is free`);
}
