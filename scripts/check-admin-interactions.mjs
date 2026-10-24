// 隔离后台验证弹层反向关闭、卡片重新展开和发布步骤；不写真实站点数据。
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { startPreview } from './preview-admin.mjs';

const preview = startPreview({ port: 4429, quiet: true });
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${preview.url}/admin/login`)).ok) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${preview.url}/admin/login`);
  await page.getByLabel('用户名', { exact: true }).fill('preview');
  await page.getByLabel('密码', { exact: true }).fill('visual-preview-only');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL(`${preview.url}/admin`);
  const userMenu = page.locator('#user-menu-open');
  await userMenu.click();
  await userMenu.click();
  await page.waitForTimeout(350);
  assert.equal(await page.locator('.pearl-popover').count(), 0, '用户菜单同触发器再次点击应收回');
  await page.evaluate(async () => {
    const root = document.createElement('section');
    root.id = 'interaction-fixture';
    root.innerHTML = '<input data-picker="date" aria-label="测试日期"><div class="select-wrap"><select aria-label="测试选项"><option>A</option><option>B</option></select></div>';
    document.body.prepend(root);
    const controller = new AbortController();
    window.interactionController = controller;
    const { initDateTimePickers } = await import('/admin-assets/picker.js?v=20261024-notifications-1');
    initDateTimePickers(controller.signal);
  });
  const date = page.getByLabel('测试日期', { exact: true });
  await date.click();
  assert.equal(await page.locator('.picker-pop').count(), 1);
  await date.click();
  await page.waitForTimeout(350);
  assert.equal(await page.locator('.picker-pop').count(), 0, '再次点击同一日期触发器应收回');
  await date.click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(350);
  assert.equal(await date.getAttribute('aria-expanded'), 'false');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await date.click();
  await date.click();
  assert.equal(await page.locator('.picker-pop').count(), 0, '减少动画模式立即收回');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  console.log('✓ 日期选择器同触发器切换与 Escape 收回');
  await page.evaluate(async () => {
    const root = document.getElementById('interaction-fixture');
    const { enhancePage } = await import('/admin-assets/interface.js?v=20261024-notifications-1');
    enhancePage(root, window.interactionController.signal);
  });
  const select = page.locator('#interaction-fixture .pearl-select-trigger');
  await select.click();
  await select.click();
  await page.waitForTimeout(350);
  assert.equal(await page.locator('.pearl-pop-select').count(), 0, '下拉菜单再次点击应收回');
  await page.evaluate(() => {
    const item = document.createElement('div');
    item.className = 'media-item';
    item.innerHTML = '<img alt="测试缩略图" style="width:80px;height:80px" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2280%22 height=%2280%22/%3E"><div class="media-item__meta"><details><summary>测试使用位置</summary>引用文章</details></div>';
    document.getElementById('interaction-fixture').append(item);
  });
  await page.locator('#interaction-fixture .media-item > img').hover();
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.pearl-hover-preview').count(), 1);
  await page.getByText('测试使用位置', { exact: true }).hover();
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.pearl-hover-preview').count(), 0, '引用入口不应被图片预览遮挡');
  console.log('✓ 缩略图触发预览，移入引用区域立即清除');
  console.log('✓ 下拉菜单同触发器切换');
  await page.evaluate(async () => {
    const root = document.getElementById('interaction-fixture');
    root.innerHTML = '<header class="page__head"></header><span id="build-state">idle</span><button id="profile-save">保存</button><section class="card"><div class="card__head"><h2 class="card__title">列表</h2></div><div id="fixture-list">内容</div></section>';
    const { initVisualizations } = await import('/admin-assets/visualizations.js?v=20261024-notifications-1');
    initVisualizations(root, window.interactionController.signal, () => {});
  });
  const header = page.locator('#interaction-fixture .card__title');
  await header.click();
  assert.equal(await header.isVisible(), true, '嵌套在标题栏内的标题必须保留');
  await header.click();
  assert.equal(await page.locator('#fixture-list').isVisible(), true);
  await page.locator('#build-state').evaluate((el) => { el.textContent = 'success'; });
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.pearl-step.is-complete').count(), 3);
  assert.match(await page.locator('.pearl-step').last().innerText(), /完成/);
  await page.locator('#build-state').evaluate((el) => { el.textContent = 'building'; });
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.pearl-step.is-active').count(), 1);
  assert.equal(await page.locator('.pearl-step.is-complete').count(), 1);
  await page.locator('#build-state').evaluate((el) => { el.textContent = 'failed'; });
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.pearl-step.is-active').count(), 0);
  assert.equal(await page.locator('.pearl-step.is-failed').count(), 1);
  assert.deepEqual(errors, []);
  console.log('✓ 列表折叠可重新展开，构建成功全部步骤完成，无脚本异常');
} finally {
  await browser?.close();
  await preview.stop();
}
