// Browser regression for the post-migration polish. API writes are disabled.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

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
  catch (error) { failures.push(label); console.log(`✗ ${label}: ${error.message.split('\n')[0]}`); }
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
async function cursorOnTop(page, dialogId, screenshot) {
  await page.locator(`[aria-controls="${dialogId}"]`).click();
  const dialog = page.locator(`#${dialogId}`);
  await dialog.waitFor({ state: 'visible' });
  const box = await dialog.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(650);
  const result = await page.evaluate(() => {
    const cursor = document.querySelector('#smooth-cursor');
    const image = cursor.querySelector('img');
    const rect = image.getBoundingClientRect();
    const previous = cursor.style.pointerEvents;
    cursor.style.pointerEvents = 'auto';
    const hit = document.elementFromPoint(rect.left + rect.width * .55, rect.top + rect.height * .55);
    cursor.style.pointerEvents = previous;
    return { aboveDialog: Boolean(hit && cursor.contains(hit)), opacity: Number(getComputedStyle(cursor).opacity),
      popover: cursor.matches(':popover-open'), inDialog: Boolean(cursor.closest('dialog[open]')) };
  });
  await page.screenshot({ path: path.join(out, screenshot) });
  // A popover outside a modal is painted in the top layer but remains inert,
  // so hit-testing alone cannot determine whether the custom cursor is visible.
  // Compare the same opaque dialog region with/without the cursor's paint.
  const imageBox = await page.locator('#smooth-cursor img').boundingBox();
  const clip = { x: Math.floor(imageBox.x), y: Math.floor(imageBox.y),
    width: Math.ceil(imageBox.width), height: Math.ceil(imageBox.height) };
  const visible = await page.screenshot({ clip, animations: 'disabled' });
  const previousVisibility = await page.locator('#smooth-cursor').evaluate((el) => {
    const previous = el.style.visibility;
    el.style.visibility = 'hidden';
    return previous;
  });
  const hidden = await page.screenshot({ clip, animations: 'disabled' });
  await page.locator('#smooth-cursor').evaluate((el, previous) => { el.style.visibility = previous; }, previousVisibility);
  result.painted = !visible.equals(hidden);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.ok(result.painted && result.opacity > .99 && (result.popover || result.inDialog || result.aboveDialog),
    `cursor must paint above the dialog: ${JSON.stringify(result)}`);
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
  await check('Explore dialog keeps the custom cursor above the top layer', () => cursorOnTop(page, 'site-menu', 'polish-explore-cursor.png'));
  await check('Appearance dialog keeps the custom cursor above the top layer', () => cursorOnTop(page, 'style-console', 'polish-appearance-cursor.png'));
  await check('Cursor smoothly settles with bounded lag, snaps on click and respects reduced motion', async () => {
    // 默认关闭平滑跟随；本组先通过真实设置菜单主动开启，再验证跟随算法。
    await page.locator('[data-style-toggle]').click();
    await page.locator('[data-console-tab="cursor"]').click();
    await page.locator('[data-cursor-setting="smooth"]').check();
    await page.keyboard.press('Escape');
    await page.mouse.move(700, 450);
    await page.waitForTimeout(250);
    const samples = await page.evaluate(async () => {
      // 连续采样真实组件的逐帧位置；坐标变化超过允许滞后，检查限幅和收敛。
      const samples = [];
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 820, clientY: 450 }));
      for (let i = 0; i < 50; i++) {
        await new Promise(requestAnimationFrame);
        const matrix = new DOMMatrixReadOnly(document.getElementById('sc-pos').style.transform);
        samples.push(Math.hypot(820 - matrix.m41, 450 - matrix.m42));
      }
      return samples;
    });
    assert.ok(samples[0] > .1 && samples[0] < 60, `expected responsive adaptive smoothing, got ${samples}`);
    assert.ok(samples.at(-1) < .4, `cursor did not settle: ${samples}`);
    assert.ok(samples.every((distance, i) => !i || distance <= samples[i - 1] + .05), 'cursor overshot or bounced');
    const snapped = await page.evaluate(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 760, clientY: 400 }));
      window.dispatchEvent(new MouseEvent('mousedown', { clientX: 760, clientY: 400 }));
      const matrix = new DOMMatrixReadOnly(document.getElementById('sc-pos').style.transform);
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: 760, clientY: 400 }));
      return { x: matrix.m41, y: matrix.m42 };
    });
    assert.deepEqual(snapped, { x: 760, y: 400 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    try {
      await page.mouse.move(710, 440);
      await page.waitForTimeout(40);
      const reduced = await page.locator('#sc-pos').evaluate((el) => {
        const matrix = new DOMMatrixReadOnly(el.style.transform);
        return { x: matrix.m41, y: matrix.m42, transition: getComputedStyle(el.querySelector('.sc-face')).transitionDuration };
      });
      assert.deepEqual(reduced, { x: 710, y: 440, transition: '0s' });
    } finally { await page.emulateMedia({ reducedMotion: 'no-preference' }); }
  });
  await check('Minimal cursor keeps its hotspot fixed during hover and press and persists across pages', async () => {
    const image = page.locator('#smooth-cursor img');
    assert.match(await image.getAttribute('src'), /akiro-minimal-ink\.svg$/);
    assert.equal(await image.evaluate((el) => el.complete && el.naturalWidth > 0), true);
    assert.equal(await image.evaluate((el) => getComputedStyle(el).width), '24px');
    const tipAt = async (x, y) => {
      const tip = await image.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        // SVG 的尖端 (6.75, 4.75)，按完整 viewBox 比例投影，缩放后仍须贴合热点。
        return { x: rect.left + rect.width * 6.75 / 32, y: rect.top + rect.height * 4.75 / 40 };
      });
      assert.ok(Math.abs(tip.x - x) < .4 && Math.abs(tip.y - y) < .4,
        `pointer tip moved away from hotspot: ${JSON.stringify({ tip, x, y })}`);
    };
    await page.mouse.move(700, 450);
    await page.waitForTimeout(800);
    await tipAt(700, 450);
    const button = await page.locator('.atlas-hero .atlas-button').first().boundingBox();
    // Chromium 的鼠标事件坐标按整数像素报告，避免把注入坐标的小数误判成偏移。
    const x = Math.round(button.x + button.width / 2);
    const y = Math.round(button.y + button.height / 2);
    await page.mouse.move(x, y);
    await page.waitForTimeout(800);
    assert.equal(await page.locator('#smooth-cursor').evaluate((el) => el.classList.contains('sc-hover')), true);
    await tipAt(x, y);
    await page.mouse.down();
    await page.waitForTimeout(180);
    await tipAt(x, y);
    // 移到非链接区域后松开，验证按下状态而不触发页面导航。
    await page.mouse.move(700, 450);
    await page.mouse.up();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, 'minimal-cursor-home.png') });
    await page.locator('#smooth-cursor').evaluate((el) => { el.dataset.qaPersistent = 'minimal'; });
    await page.locator('.atlas-nav__links a[href="/about/"]').click();
    await page.waitForURL('**/about/');
    assert.equal(await page.locator('#smooth-cursor').getAttribute('data-qa-persistent'), 'minimal');
    await page.goto(base);
  });
  await check('Cursor settings preview, toggles, keyboard, persistence and independent reset work', async () => {
    const openSettings = async () => {
      await page.locator('[data-style-toggle]').click();
      await page.locator('[data-console-tab="cursor"]').click();
    };
    const setting = (key) => page.locator(`[data-cursor-setting="${key}"]`);
    await openSettings();
    assert.equal(await setting('duration').inputValue(), '70');
    assert.equal(await setting('maxLag').inputValue(), '24');
    // 原生范围控件接受键盘调整，输出和实际运行状态必须同时变化。
    await setting('duration').focus();
    await page.keyboard.press('End');
    assert.equal(await setting('duration').inputValue(), '220');
    assert.equal(await page.locator('[data-cursor-output="duration"]').innerText(), '220ms');
    for (const [key, value] of Object.entries({ size: 36, maxLag: 80, hoverScale: 1.2, pressScale: .8, transition: 300 })) {
      await setting(key).evaluate((el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); }, value);
    }
    assert.equal(await page.locator('#smooth-cursor img').evaluate((el) => getComputedStyle(el).width), '36px');
    await setting('smooth').uncheck();
    assert.equal(await setting('duration').isDisabled(), true);
    const direct = await page.evaluate(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 600, clientY: 400 }));
      const matrix = new DOMMatrixReadOnly(document.getElementById('sc-pos').style.transform);
      const rect = document.querySelector('#smooth-cursor img').getBoundingClientRect();
      return { x: matrix.m41, y: matrix.m42, tipX: rect.left + rect.width * 6.75 / 32, tipY: rect.top + rect.height * 4.75 / 40 };
    });
    assert.equal(direct.x, 600); assert.equal(direct.y, 400);
    assert.ok(Math.abs(direct.tipX - 600) < .4 && Math.abs(direct.tipY - 400) < .4, 'Resizing the pointer displaced its tip');
    await setting('enabled').uncheck();
    assert.equal(await page.locator('html').evaluate((el) => el.classList.contains('sc-on')), false);
    assert.equal(await page.locator('#smooth-cursor').evaluate((el) => getComputedStyle(el).opacity), '0');
    await page.reload();
    await openSettings();
    assert.equal(await setting('enabled').isChecked(), false);
    assert.equal(await setting('size').inputValue(), '36');
    assert.equal(await setting('size').isDisabled(), true);
    await setting('enabled').check();
    await setting('smooth').check();
    assert.equal(await setting('duration').inputValue(), '220');
    // 页签支持方向键，切换后焦点和可见内容一致。
    await page.locator('#cursor-tab').focus();
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('#appearance-panel').isVisible(), true);
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#cursor-panel').isVisible(), true);
    await page.screenshot({ path: path.join(out, 'cursor-settings-desktop.png') });
    await page.keyboard.press('Escape');
    await page.locator('.atlas-nav__links a[href="/about/"]').click();
    await page.waitForURL('**/about/');
    await openSettings();
    assert.equal(await setting('size').inputValue(), '36');
    assert.equal(await page.locator('#smooth-cursor img').evaluate((el) => getComputedStyle(el).width), '36px');
    const appearanceBefore = await page.evaluate(() => localStorage.getItem('akiro-appearance'));
    await page.locator('[data-cursor-reset]').click();
    assert.equal(await setting('size').inputValue(), '24');
    assert.equal(await setting('duration').inputValue(), '70');
    assert.equal(await setting('smooth').isChecked(), false);
    assert.equal(await page.evaluate(() => localStorage.getItem('akiro-cursor')), null);
    assert.equal(await page.evaluate(() => localStorage.getItem('akiro-appearance')), appearanceBefore);
    await page.keyboard.press('Escape');
    await page.goto(base);
  });
  await check('Text inputs retain a system text pointer and touch devices keep the custom cursor hidden', async () => {
    await page.goto(`${base}/friends/`);
    await page.locator('.friend-form input').first().hover();
    await page.waitForTimeout(200);
    assert.equal(await page.locator('.friend-form input').first().evaluate((el) => getComputedStyle(el).cursor), 'text');
    assert.equal(await page.locator('#smooth-cursor').evaluate((el) => getComputedStyle(el).opacity), '0');
    const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    try {
      await touch.addInitScript(() => sessionStorage.setItem('blog-api-down-at', String(Date.now())));
      await touch.route('**/api/**', (route) => route.fulfill({ status: 503, body: 'QA: API disabled' }));
      const mobile = await touch.newPage();
      await mobile.goto(base);
      assert.equal(await mobile.locator('html').evaluate((el) => el.classList.contains('sc-on')), false);
      assert.equal(await mobile.locator('#smooth-cursor').evaluate((el) => getComputedStyle(el).opacity), '0');
      await mobile.locator('[data-style-toggle]').click();
      await mobile.locator('#cursor-tab').click();
      assert.match(await mobile.locator('[data-cursor-status]').innerText(), /触屏/);
      assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const fits = await mobile.locator('#cursor-panel').evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
      assert.equal(fits, true);
      await mobile.screenshot({ path: path.join(out, 'cursor-settings-mobile.png') });
    } finally { await touch.close(); }
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
    await page.locator('.tk-textarea__inner').waitFor();
    await page.locator('.tk-textarea__inner').fill('UI QA preview only');
    await page.locator('.tk-submit .tk-button--primary').waitFor({ state: 'visible' });
    const styles = await page.evaluate(() => {
      const text = document.querySelector('.tk-textarea__inner');
      const send = document.querySelector('.tk-submit .tk-button--primary');
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
        const sample = await page.locator('.tk-textarea__inner').evaluate((el) => ({
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
