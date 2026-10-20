// Public UI integration checks. Real published content; all API traffic is disabled
// so browsing cannot write analytics/comments or touch the running admin service.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { chromium, expect } from '@playwright/test';

const port = Number(process.env.PUBLIC_UI_PORT || 4331);
const base = process.env.PUBLIC_UI_URL || `http://127.0.0.1:${port}`;
const out = path.resolve('docs/assets/spring-ui');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
if (!process.env.PUBLIC_UI_URL) {
  // Astro otherwise silently picks another port, which could accidentally test
  // an unrelated existing preview and leave its process running afterwards.
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', () => reject(Error(`Public UI port ${port} is already in use; stop that preview or choose PUBLIC_UI_PORT`)));
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
}
const server = process.env.PUBLIC_UI_URL ? null : spawn(process.execPath,
  ['node_modules/astro/bin/astro.mjs', 'dev', '--host', '127.0.0.1', '--port', String(port), '--ignore-lock'],
  // Astro 7 otherwise detects agents and detaches a second server process.
  // This flag keeps the server in this process, owned by this test's finally.
  { stdio: 'ignore', windowsHide: true, env: { ...process.env, ASTRO_DEV_BACKGROUND: '1' } });
let browser;
let checks = 0;
const errors = [];
const consoleErrors = [];
function pass(label) { checks++; console.log(`✓ ${label}`); }
async function noOverflow(page, label) {
  const sizes = await page.evaluate(() => ({ width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth }));
  assert.ok(sizes.scroll <= sizes.width + 2, `${label}: page overflows ${sizes.scroll - sizes.width}px`);
}
async function openConsole(page) {
  await page.locator('[data-style-toggle]').click();
  await page.locator('#style-console').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#style-console').evaluate((el) => el.open), true);
}
async function closeConsole(page) {
  await page.keyboard.press('Escape');
  await page.locator('#style-console').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('[data-style-toggle]').evaluate((el) => el === document.activeElement), true,
    'Escape must restore focus to the appearance trigger');
}
async function settleHero(page) {
  await page.waitForFunction(() => [...document.querySelectorAll('[data-hero-reveal]')]
    .every((el) => Number(getComputedStyle(el).opacity) > 0.99));
  await page.evaluate(() => document.fonts.ready);
}
async function captureFullPage(page, name) {
  await settleHero(page);
  const { height, step } = await page.evaluate(() => ({ height: document.documentElement.scrollHeight,
    step: Math.floor(window.innerHeight * 0.65) }));
  for (let top = 0; top < height; top += step) {
    await page.evaluate((offset) => window.scrollTo({ top: offset, behavior: 'instant' }), top);
    await page.waitForTimeout(180);
  }
  await page.waitForTimeout(900);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(out, name), fullPage: true });
}
async function configureContext(context) {
  await context.addInitScript(() => sessionStorage.setItem('blog-api-down-at', String(Date.now())));
  await context.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
    // Developer chrome is unrelated to the production UI under review.
    const style = document.createElement('style');
    style.textContent = 'astro-dev-toolbar{display:none!important}';
    document.head.append(style);
  }));
  await context.route('**/api/**', (route) => route.fulfill({ status: 503, body: 'Public UI QA: API disabled' }));
}
function watchPage(page) {
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push({ text: message.text(), url: message.location().url });
  });
}

try {
  fs.mkdirSync(out, { recursive: true });
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(base)).ok) break; } catch {}
    if (i === 119) throw Error('Public Astro preview did not start');
    await delay(250);
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, timezoneId: 'Asia/Shanghai' });
  await configureContext(context);
  let page = await context.newPage();
  watchPage(page);
  // The reference must render without JavaScript exceptions. Third-party blocked
  // media is intentionally not classified as a JavaScript runtime exception.
  await page.goto(base);
  await page.locator('.atlas-hero').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);
  await settleHero(page);
  const hero = await page.locator('.atlas-hero').boundingBox();
  assert.ok(hero.height >= 960 * 0.85, 'Opening scene must fill the viewport');
  await noOverflow(page, 'desktop home');
  await page.screenshot({ path: path.join(out, 'home-desktop.png') });
  pass('Full viewport opening and desktop width');
  const typed = await page.locator('[data-typewriter]').textContent();
  await page.waitForFunction((previous) => document.querySelector('[data-typewriter]')?.textContent !== previous, typed);
  assert.equal(await page.locator('.atlas-waves').evaluate((el) => el.getAnimations({ subtree: true })
    .some((animation) => animation.playState === 'running')), true, 'Wave layers should animate');
  pass('Typewriter text changes over time and layered waves animate');

  await openConsole(page);
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#style-console').evaluate((el) => el.contains(document.activeElement)), true);
  for (const style of ['life', 'swiss', 'minimalist', 'glass', 'brutalist']) {
    await page.locator(`[data-style-choice="${style}"]`).click();
    assert.equal(await page.locator('html').getAttribute('data-style'), style);
    assert.equal(await page.locator(`[data-style-choice="${style}"]`).getAttribute('aria-pressed'), 'true');
    await noOverflow(page, `desktop style ${style}`);
  }
  await page.locator('[data-style-choice="swiss"]').click();
  for (const mode of ['time', 'scroll', 'manual']) {
    await page.locator(`button[data-style-mode="${mode}"]`).click();
    assert.equal(await page.locator('html').getAttribute('data-style-mode'), mode);
    if (mode === 'time') {
      const expected = await page.evaluate(() => {
        const hour = new Date().getHours();
        return hour >= 6 && hour < 9 ? 'minimalist' : hour >= 9 && hour < 18 ? 'life' : 'glass';
      });
      assert.equal(await page.locator('html').getAttribute('data-style'), expected, 'Time mode follows local browser hour');
    }
  }
  await page.locator('button[data-style-mode="scroll"]').click();
  await closeConsole(page);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(300);
  const topStyle = await page.locator('html').getAttribute('data-style');
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await expect(page.locator('html')).not.toHaveAttribute('data-style', topStyle);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await openConsole(page);
  await page.locator('button[data-style-mode="manual"]').click();
  await page.locator('[data-style-choice="swiss"]').click();
  await closeConsole(page);
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-style'), 'swiss');
  assert.equal(await page.locator('html').getAttribute('data-style-mode'), 'manual');
  assert.equal(await page.locator('html').getAttribute('aria-pressed'), null, 'Appearance controls must not assign button semantics to the document');
  pass('All five styles, all three modes, Escape focus and reload persistence');

  const initialTheme = await page.locator('html').getAttribute('data-theme');
  await page.locator('[data-theme-toggle]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', initialTheme === 'dark' ? 'light' : 'dark');
  await page.waitForTimeout(600);
  await settleHero(page);
  await page.screenshot({ path: path.join(out, 'home-dark.png') });
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-theme'), initialTheme === 'dark' ? 'light' : 'dark');
  pass('Light/dark toggle works and persists alongside visual style');

  await page.locator('[data-menu-toggle]').click();
  await page.locator('#site-menu').waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-menu-toggle]').getAttribute('aria-expanded'), 'true');
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#site-menu').evaluate((el) => el.contains(document.activeElement)), true);
  await page.keyboard.press('Escape');
  await page.locator('#site-menu').waitFor({ state: 'hidden' });
  await expect(page.locator('[data-menu-toggle]')).toHaveAttribute('aria-expanded', 'false');
  assert.equal(await page.locator('[data-menu-toggle]').evaluate((el) => el === document.activeElement), true);
  pass('Navigation dialog Escape, expanded state and focus restoration');

  // Discover detail routes from actual published content, without logging titles.
  const detail = await page.locator('a[href]').evaluateAll((links) => links.map((el) => el.getAttribute('href'))
    .filter((href) => /^\/(posts|tags|categories|projects)\/[^?#]+\/?$/.test(href)));
  const rail = page.locator('[data-rail]').first();
  await rail.scrollIntoViewIfNeeded();
  const track = rail.locator('[data-rail-track]');
  await track.waitFor();
  const before = await track.evaluate((el) => el.getBoundingClientRect().left);
  await page.mouse.wheel(0, 700);
  await page.waitForTimeout(900);
  const after = await track.evaluate((el) => el.getBoundingClientRect().left);
  assert.ok(after < before - 10, 'Desktop vertical scroll should move the horizontal article track');
  pass('Desktop article rail responds to vertical scrolling');

  const routes = [...new Set(['/archive/', '/notes/', '/projects/', '/about/', '/friends/', '/nav/', '/search/', '/404', ...detail])];
  // Use an actual client-side link for navigation to detect lifecycle leaks.
  await page.locator('.atlas-nav__links a[href="/archive/"]').click();
  await page.waitForURL(`${base}/archive/`);
  assert.equal(await page.locator('html').getAttribute('data-style'), 'swiss');
  assert.equal(await page.locator('.pin-spacer [data-rail]').count(), 0);
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.__akiroMotion?.detached), 0, 'No ScrollTrigger may retain a detached page element');
  const taxonomy = await page.locator('a[href]').evaluateAll((links) => {
    const hrefs = links.map((el) => el.getAttribute('href'));
    return ['tags', 'categories'].map((type) => hrefs.find((href) => href.startsWith(`/${type}/`))).filter(Boolean);
  });
  for (const route of taxonomy) if (!routes.includes(route)) routes.push(route);
  pass('Client navigation preserves appearance and removes the home rail');
  for (const route of routes) {
    await page.goto(`${base}${route}`);
    await page.locator('main').waitFor();
    if (route === '/projects/') {
      const projectDetails = await page.locator('main a[href]').evaluateAll((links) => links.map((el) => el.getAttribute('href')).filter((href) => /^\/projects\/[^?#]+\/?$/.test(href)));
      for (const href of projectDetails) if (!routes.includes(href)) routes.push(href);
    }
    await noOverflow(page, `desktop ${route}`);
    assert.equal(await page.locator('html').getAttribute('data-style'), 'swiss');
  }
  pass(`All ${routes.length} public list/detail routes render without desktop overflow`);

  // Default-look review artifacts, using real public content and original URLs.
  await openConsole(page);
  await page.locator('button[data-style-mode="manual"]').click();
  await page.locator('[data-style-choice="life"]').click();
  await closeConsole(page);
  if (await page.locator('html').getAttribute('data-theme') !== 'light') {
    await page.locator('[data-theme-toggle]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  }
  await page.goto(`${base}/about/`);
  await captureFullPage(page, 'about-desktop.png');
  const articleRoute = routes.find((route) => route.startsWith('/posts/'));
  assert.ok(articleRoute, 'Real published content must provide an article detail route for validation');
  {
    await page.goto(`${base}${articleRoute}`);
    await page.waitForFunction(() => [...document.querySelectorAll('.article__header > *')]
      .every((el) => Number(getComputedStyle(el).opacity) > 0.99));
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(out, 'article-desktop.png') });
  }
  await openConsole(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, 'appearance-desktop.png') });
  await closeConsole(page);

  await context.close();
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
    hasTouch: true, timezoneId: 'Asia/Shanghai' });
  await configureContext(mobile);
  page = await mobile.newPage();
  watchPage(page);
  for (const route of ['/', ...routes]) {
    await page.goto(`${base}${route}`);
    await page.locator('main').waitFor();
    await noOverflow(page, `mobile ${route}`);
  }
  await page.goto(base);
  await openConsole(page);
  await page.locator('button[data-style-mode="manual"]').click();
  await page.locator('[data-style-choice="life"]').click();
  await closeConsole(page);
  if (await page.locator('html').getAttribute('data-theme') !== 'light') {
    await page.locator('[data-theme-toggle]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  }
  await captureFullPage(page, 'home-mobile.png');
  await expect(page.locator('[data-site-stats]')).toHaveCSS('opacity', '1');
  assert.equal(await page.locator('[data-stats-value="posts"]').evaluate((el) => Number(getComputedStyle(el).opacity) > 0.99), true,
    'Published site statistics must remain visible after the scroll reveal');
  const mobileTrack = page.locator('[data-rail-track]').first();
  const scroller = await mobileTrack.evaluate((el) => {
    let target = el;
    while (target && !(target.scrollWidth > target.clientWidth && /auto|scroll/.test(getComputedStyle(target).overflowX)))
      target = target.parentElement;
    if (!target) return null;
    target.scrollLeft = 160;
    return { moved: target.scrollLeft, overflow: getComputedStyle(target).overflowX };
  });
  assert.ok(scroller?.moved > 0, 'Mobile rail must provide native horizontal scrolling');
  pass('Mobile routes fit viewport and article rail provides native horizontal scrolling');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await page.locator('.atlas-hero').waitFor();
  assert.equal(await page.evaluate(() => window.__akiroMotion?.reduced), true);
  assert.equal(await page.evaluate(() => window.__akiroMotion?.triggers), 0, 'Reduced motion disables all Spring ScrollTriggers');
  assert.equal(await page.evaluate(() => window.__akiroMotion?.smooth), false, 'Reduced motion disables smooth scrolling');
  assert.equal(await page.locator('.pin-spacer [data-rail]').count(), 0,
    'Reduced motion must disable the pinned horizontal rail');
  const continuousWaves = await page.locator('.atlas-waves').evaluate((el) => el.getAnimations({ subtree: true })
    .filter((animation) => animation.playState === 'running' && animation.effect.getTiming().iterations === Infinity).length);
  assert.equal(continuousWaves, 0, 'Reduced motion must stop continuous wave animations');
  await settleHero(page);
  await page.screenshot({ path: path.join(out, 'home-reduced-motion.png') });
  pass('Reduced motion keeps content readable without pinned scrolling');
  assert.deepEqual(errors, [], 'No browser pageerror is permitted');
  const localScriptErrors = consoleErrors.filter(({ url, text }) => {
    // Chromium assigns a CORS diagnostic to the current document even when
    // the failed fetch target is a third-party music provider.
    const corsTarget = text.match(/Access to fetch at '([^']+)'/);
    const externalCors = corsTarget && new URL(corsTarget[1]).origin !== new URL(base).origin;
    return url.startsWith(base) && !/Failed to load resource/.test(text) && !externalCors;
  });
  assert.deepEqual(localScriptErrors, [], 'No first-party script console errors are permitted');
  if (consoleErrors.length) console.log(`Browser console: ${consoleErrors.length} resource/third-party errors (inspect network separately)`);
  pass('No JavaScript runtime exceptions during complete regression');
  console.log(`Public UI: ${checks} checks passed; screenshots: ${out}`);
} finally {
  await browser?.close();
  if (server) {
    if (process.platform === 'win32') {
      const stop = spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      await new Promise((resolve) => stop.once('exit', resolve));
    } else server.kill('SIGTERM');
  }
}
