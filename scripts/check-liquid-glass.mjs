// 真正检查背景像素是否发生折射，而不把 CSS 声明存在当作效果已绘制。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';

const port = 4343, base = `http://127.0.0.1:${port}`;
await new Promise((resolve, reject) => {
  const probe = net.createServer(); probe.once('error', reject);
  probe.listen(port, '127.0.0.1', () => probe.close(resolve));
});
const server = spawn(process.execPath, ['node_modules/astro/bin/astro.mjs', 'dev', '--host', '127.0.0.1', '--port', String(port), '--ignore-lock'], {
  stdio: 'ignore', windowsHide: true, env: { ...process.env, ASTRO_DEV_BACKGROUND: '1' },
});
const out = path.resolve('docs/assets/spring-ui');
let browser;
const errors = [];
try {
  fs.mkdirSync(out, { recursive: true });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base)).ok) break; } catch {}
    if (i === 99) throw Error('液态玻璃预览未启动');
    await delay(150);
  }
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await context.addInitScript(() => sessionStorage.setItem('blog-api-down-at', String(Date.now())));
  await context.route('**/api/**', (route) => route.fulfill({ status: 503, body: 'Isolated UI test' }));
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base);
  // 冷启动依赖优化可能触发一次开发页面重载，等首轮资源稳定后再读取 DOM。
  await page.waitForLoadState('networkidle');
  await page.locator('[data-liquid-ready="true"]').waitFor();
  await page.evaluate(() => document.fonts.ready);
  const map = () => page.locator('#akiro-nav-refraction feImage').getAttribute('href');
  const original = await map();
  assert.ok(original.startsWith('data:image/png;base64,'));
  assert.equal(await page.locator('.atlas-nav__links').evaluate((el) => getComputedStyle(el).filter), 'none');
  assert.equal(await page.locator('.atlas-nav__glass').evaluate((el) => getComputedStyle(el).backgroundImage), 'none', '玻璃中间不应存在增白/压黑的渐变带');
  console.log('✓ 按实际尺寸生成 SDF 位移 PNG，滤镜与文字层分离');

  // 棋盘作为导航背后的受控背景；暂停运动并隐藏光标，重复基线截图确认无异步噪声。
  await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}#smooth-cursor,astro-dev-toolbar{visibility:hidden!important}' });
  await page.evaluate(() => {
    const grid = document.createElement('div'); grid.id = 'glass-probe';
    grid.style.cssText = 'position:fixed;inset:0 0 auto;height:110px;z-index:49;background:repeating-linear-gradient(45deg,#122b3e 0 8px,#f6e5b6 8px 16px)';
    document.body.append(grid);
  });
  await page.mouse.move(700, 200);
  const nav = await page.locator('.atlas-nav').boundingBox();
  const clip = { x: Math.floor(nav.x + nav.width / 2 - 160), y: Math.ceil(nav.y + 3), width: 320, height: 10 };
  const scales = await page.locator('#akiro-nav-refraction feDisplacementMap').evaluateAll((nodes) => nodes.map((el) => el.getAttribute('scale')));
  await page.locator('#akiro-nav-refraction feDisplacementMap').evaluateAll((nodes) => nodes.forEach((el) => el.setAttribute('scale', '0')));
  await page.waitForTimeout(150);
  const flat = await page.screenshot({ clip });
  assert.ok(flat.equals(await page.screenshot({ clip })), '重复基线必须一致');
  await page.locator('#akiro-nav-refraction feDisplacementMap').evaluateAll((nodes, values) => nodes.forEach((el, i) => el.setAttribute('scale', values[i])), scales);
  await page.waitForTimeout(150);
  const refracted = await page.screenshot({ clip });
  assert.equal(refracted.equals(flat), false, '边缘必须弯曲真实背景像素');
  await page.screenshot({ path: path.join(out, 'liquid-glass-refraction-probe.png'), clip: { x: 0, y: 0, width: 1440, height: 115 } });
  await page.locator('#glass-probe').evaluate((el) => el.remove());
  console.log('✓ 关闭/开启位移时真实背景像素不同，重复基线无差异');

  for (const style of ['life', 'swiss', 'minimalist', 'glass', 'brutalist']) {
    await page.evaluate((value) => { document.documentElement.dataset.style = value; }, style);
    await page.waitForTimeout(120);
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
      assert.equal(await page.locator('.atlas-nav').getAttribute('data-liquid-ready'), 'true');
      assert.equal(await page.locator('.atlas-nav__glass').evaluate((el) => getComputedStyle(el).display), 'block');
    }
  }
  await page.evaluate(() => { document.documentElement.dataset.style = 'life'; document.documentElement.dataset.theme = 'light'; });
  await page.waitForTimeout(150);
  const beforeMove = await map();
  await page.mouse.move(nav.x + 140, nav.y + 30);
  await page.waitForTimeout(100);
  assert.equal(await map(), beforeMove, '指针移动不能重复生成贴图');
  assert.equal(await page.locator('.atlas-nav').evaluate((el) => el.style.getPropertyValue('--nav-light-opacity')), '.65');
  await page.mouse.down();
  assert.equal(await page.locator('.atlas-nav').evaluate((el) => el.classList.contains('is-glass-pressed')), true);
  await page.mouse.up();
  await page.locator('[data-menu-toggle]').click();
  await page.locator('#site-menu').waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  await page.locator('[data-menu-toggle]').evaluate((el) => el.blur());
  await page.mouse.move(700, 200);
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(out, 'liquid-glass-home.png') });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await page.screenshot({ path: path.join(out, 'liquid-glass-dark.png') });
  console.log('✓ 五风格明暗材质、高光、按压及探索交互正常，移动指针不重算贴图');

  await page.locator('.atlas-nav__links a[href="/about/"]').click();
  await page.waitForURL('**/about/');
  await page.locator('[data-liquid-ready="true"]').waitFor();
  assert.equal(await page.locator('#akiro-nav-refraction').count(), 1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.mouse.move(200, 40);
  assert.equal(await page.locator('.atlas-nav__light').evaluate((el) => Number(getComputedStyle(el).opacity)), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => Number(document.querySelector('#akiro-nav-refraction').getAttribute('width')) < 390);
  assert.notEqual(await map(), beforeMove);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= 391), true);
  await page.screenshot({ path: path.join(out, 'liquid-glass-mobile.png') });
  console.log('✓ Astro 跨页单一滤镜、减少动画及手机贴图重建与布局通过');

  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
  await page.locator('[data-liquid-ready="false"]').waitFor();
  assert.equal(await page.locator('.atlas-nav').evaluate((el) => getComputedStyle(el).backdropFilter), 'none');
  assert.equal(await page.locator('.atlas-nav__glass').evaluate((el) => getComputedStyle(el).display), 'none');
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'no-preference' }] });
  await page.locator('[data-liquid-ready="true"]').waitFor();
  console.log('✓ 减少透明度时改为实色导航，偏好恢复后重新启用折射');

  // 模拟浏览器不支持 SVG 背景滤镜，确认使用可读的原生模糊且菜单仍可操作。
  const fallback = await context.newPage();
  await fallback.addInitScript(() => {
    const supports = CSS.supports.bind(CSS);
    CSS.supports = (...args) => args.some((value) => String(value).includes('akiro-nav-refraction')) ? false : supports(...args);
  });
  await fallback.goto(base);
  await fallback.locator('[data-liquid-ready="false"]').waitFor();
  assert.ok((await fallback.locator('.atlas-nav').evaluate((el) => getComputedStyle(el).backdropFilter)).includes('blur'));
  await fallback.locator('[data-menu-toggle]').click();
  await fallback.locator('#site-menu').waitFor({ state: 'visible' });
  assert.deepEqual(errors, []);
  console.log('✓ 不支持 SVG 滤镜时毛玻璃降级与菜单正常，无页面脚本异常');
} finally {
  await browser?.close();
  await new Promise((resolve) => spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('exit', resolve));
}
