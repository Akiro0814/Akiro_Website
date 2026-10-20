// 使用隔离后台复现分段选项错位，直接对比选中按钮与滑块的实际绘制边界。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { startPreview } from './preview-admin.mjs';

const preview = startPreview({ port: 4416, quiet: true });
const out = path.resolve('docs/assets/admin-pearl');
let browser, page;
const errors = [];
async function aligned(scope, label) {
  const measurements = await scope.locator('.pearl-segment').evaluateAll((groups) => groups.map((group) => {
    const box = group.getBoundingClientRect();
    const active = group.querySelector('[aria-pressed="true"]').getBoundingClientRect();
    const thumb = group.querySelector('.pearl-slider').getBoundingClientRect();
    return { label: group.textContent, x: thumb.x-active.x, y: thumb.y-active.y,
      width: thumb.width-active.width, height: thumb.height-active.height,
      inside: thumb.left >= box.left && thumb.top >= box.top && thumb.right <= box.right + 1 && thumb.bottom <= box.bottom + 1 };
  }));
  assert.ok(measurements.length, `${label}: 必须存在分段选项`);
  assert.ok(measurements.every((m) => m.inside && ['x','y','width','height'].every((key) => Math.abs(m[key]) <= 1.25)), `${label}: ${JSON.stringify(measurements)}`);
}
try {
  fs.mkdirSync(out, { recursive: true });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${preview.url}/admin/login`)).ok) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${preview.url}/admin/login`);
  await page.getByLabel('用户名', { exact: true }).fill('preview');
  await page.getByLabel('密码', { exact: true }).fill('visual-preview-only');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL(`${preview.url}/admin`);
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('button', { name: '外观设置', exact: true }).click();
  const dialog = page.locator('.pearl-dialog');
  await page.waitForTimeout(850);
  await aligned(dialog, '初次打开外观设置');
  console.log('✓ 初始主题与密度选项的背景和按钮四边对齐');
  for (const label of ['深色','浅色','跟随系统','宽松','紧凑','标准']) {
    await dialog.getByRole('button', { name: label, exact: true }).click();
    await page.waitForTimeout(750);
    await aligned(dialog, label);
  }
  await dialog.screenshot({ path: path.join(out, 'segments-appearance.png') });
  console.log('✓ 所有主题和密度切换后保持对齐');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  await aligned(dialog, '手机外观');
  await dialog.screenshot({ path: path.join(out, 'segments-mobile.png') });
  await page.keyboard.press('Escape');
  await page.locator('.pearl-overlay').waitFor({ state: 'detached' });
  await page.setViewportSize({ width: 1440, height: 960 });
  console.log('✓ 手机尺寸变化后自动重算对齐');
  for (const module of ['posts','notes','links']) {
    await page.locator(`.nav__item[href="/admin/${module}"]`).click();
    await page.waitForURL(`${preview.url}/admin/${module}`);
    await page.locator('.pearl-segment').waitFor();
    const group = page.locator('.pearl-segment').first();
    for (const button of await group.locator('button').all()) {
      await button.scrollIntoViewIfNeeded();
      const rect = await button.boundingBox();
      // 保持按下，让通用按压缩放真实发生，松手后选中背景也必须回到完整按钮边界。
      await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
      await page.mouse.down(); await page.waitForTimeout(180); await page.mouse.up();
      await page.waitForTimeout(750);
      await aligned(page, module);
    }
    if (module === 'posts') await group.screenshot({ path: path.join(out, 'segments-content.png') });
  }
  console.log('✓ 文章/随笔/导航全部视图选项在按压后对齐');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: '外观设置', exact: true }).click();
  await page.waitForTimeout(100);
  await aligned(page.locator('.pearl-dialog'), '减少动画');
  assert.deepEqual(errors, []);
  console.log('✓ 减少动画下立即对齐，无页面脚本异常');
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(out, 'segments-failure.png') });
  throw error;
} finally { await browser?.close(); await preview.stop(); }
