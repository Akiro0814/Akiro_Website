// 第二轮体验回归：始终在独立副本中测量换页、公告、导航卡片和关于页互动。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';
import { runInPublicFixture } from './lib/public-ui-fixture.mjs';

await runInPublicFixture(import.meta.url);
fs.writeFileSync('data/nav.json', JSON.stringify({ categories: [{ name: '旧分类', links: Array.from({ length: 9 }, (_, i) => ({ name: `网址 ${i} ${'长网站名称'.repeat(5)}`, url: `https://example.com/${i}`, desc: '很长的说明文字'.repeat(10) })) }] }));
const base = 'http://127.0.0.1:4361';
const server = spawn(process.execPath, ['node_modules/astro/bin/astro.mjs', 'dev', '--host', '127.0.0.1', '--port', '4361', '--ignore-lock'], { windowsHide: true, stdio: 'ignore', env: { ...process.env, ASTRO_DEV_BACKGROUND: '1' } });
let browser;
try {
  for (let i = 0; i < 150; i++) { try { if ((await fetch(base)).ok) break; } catch {} await delay(150); }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://example.com/**', (route) => route.abort());
  let announcements = false;
  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url());
    const target = url.searchParams.has('r') ? decodeURIComponent(Buffer.from(url.searchParams.get('r'), 'base64').toString()) : url.pathname;
    return route.fulfill({ json: target === '/api/public/announcements' ? { items: announcements ? [{ id: 'refine', title: '全屏公告测试', content: '这是一条公告。' }] : [] } : {} });
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  const glassButton=page.locator('.atlas-nav__links a').first();
  const buttonRect=await glassButton.boundingBox();
  await glassButton.dispatchEvent('pointerdown',{button:0,clientX:buttonRect.x+buttonRect.width/2,clientY:buttonRect.y+buttonRect.height/2});
  await expect(glassButton).toHaveClass(/is-liquid-pressed/);
  assert.ok(await page.locator('.nav-button__light').evaluateAll((nodes)=>nodes.some((node)=>Number(node.style.opacity)>0)));
  await page.evaluate(()=>window.dispatchEvent(new PointerEvent('pointerup')));
  assert.ok(await glassButton.evaluate((el)=>el.getAnimations().some((animation)=>animation.effect.getTiming().duration===500)));
  await page.evaluate(() => {
    window.persistedNavigation=document.querySelector('[data-site-header]');
    window.persistedFilter=document.getElementById('akiro-nav-refraction');
    window.routeSamples = []; window.routeWork = [];
    new PerformanceObserver((list) => window.routeWork.push(...list.getEntries().map((entry) => entry.duration))).observe({ type: 'longtask', buffered: true });
    let started;
    document.addEventListener('astro:before-preparation', () => { started = performance.now(); });
    document.addEventListener('astro:page-load', () => { if (started) window.routeSamples.push(performance.now() - started); });
  });
  for (const route of ['/about/', '/projects/', '/about/', '/projects/']) {
    const count = await page.evaluate(() => window.routeSamples.length);
    await page.locator(`a[href="${route}"]`).first().click();
    await page.waitForURL(`${base}${route}`);
    await page.waitForFunction((before) => window.routeSamples.length > before, count);
    await page.waitForTimeout(500);
  }
  console.log('换页采样(ms)：', JSON.stringify(await page.evaluate(() => ({ routes: window.routeSamples.map(Math.round), longTasks: window.routeWork.map(Math.round), detached: window.__akiroMotion.detached }))));
  if (process.env.REFINEMENT_BASELINE === '1') process.exitCode = 0;
  else {
    assert.equal(await page.evaluate(()=>window.persistedNavigation===document.querySelector('[data-site-header]')&&window.persistedFilter===document.getElementById('akiro-nav-refraction')),true,'换页复用导航及滤镜节点，不反复销毁材质');
    await page.goto(`${base}/nav/`, { waitUntil: 'networkidle' });
    for (const width of [1440, 900, 390]) {
      await page.setViewportSize({ width, height: 960 });
      const layout = await page.locator('[data-nav-link]').evaluateAll((links) => {
        const boxes = links.map((link) => { const r = link.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; });
        return { overflow: document.documentElement.scrollWidth > innerWidth + 1, overlap: boxes.some((a, i) => boxes.slice(i + 1).some((b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1)) };
      });
      assert.deepEqual(layout, { overflow: false, overlap: false }, `${width}px 导航不能重叠或溢出`);
    }
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto(`${base}/about/`, { waitUntil: 'networkidle' });
    const card = page.locator('.about-collage__cards > *').first();
    await card.hover();
    await expect(card).toHaveCSS('z-index', '3');
    await page.getByRole('heading', { name: /与代码对话/ }).hover();
    await expect(card).not.toHaveCSS('z-index', '3');
    announcements = true;
    await page.goto(base, { waitUntil: 'networkidle' });
    const modal = page.locator('dialog[data-announce]');
    await expect(modal).toBeVisible();
    assert.equal(await modal.evaluate((el) => el.matches(':modal')), true);
    const rect = await modal.boundingBox();
    assert.ok(rect.width >= 1438 && rect.height >= 958, '公告应覆盖全屏');
    fs.mkdirSync('docs/assets/spring-ui', { recursive: true });
    await page.screenshot({ path:path.resolve('docs/assets/spring-ui/refinement-announcement.png') });
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('has-announcement')), false);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('dialog[data-announce]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[data-announce]')).toBeHidden();
    fs.mkdirSync('docs/assets/spring-ui', { recursive: true });
    await page.screenshot({ path: path.resolve('docs/assets/spring-ui/refinement-home.png') });
    assert.deepEqual(errors, []);
    console.log('✓ 全屏公告、Escape、长网址卡片布局、关于页卡片突出和换页无脚本异常');
  }
} finally { await browser?.close(); server.kill(); }
