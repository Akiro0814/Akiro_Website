// Real browser regression against generated data; never uses the live blog's credentials/data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { startPreview } from './preview-admin.mjs';

const preview = startPreview({ port: 4414, quiet: true });
const out = path.resolve('docs/assets/admin-pearl');
fs.mkdirSync(out, { recursive: true });
const errors = [];
let browser;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let checks = 0;
function pass(message) {
  checks++;
  console.log(`✓ ${message}`);
}
try {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`${preview.url}/admin/login`);
      if (res.ok) break;
    } catch {}
    if (i === 99) throw Error('Isolated server did not start');
    await delay(100);
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !/favicon/.test(message.text())) errors.push(message.text());
  });
  await page.goto(`${preview.url}/admin/login`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(out, 'login.png') });
  await page.getByLabel('用户名', { exact: true }).fill('preview');
  await page.getByLabel('密码', { exact: true }).fill('wrong-fixture-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.locator('#login-error').waitFor({ state: 'visible' });
  assert.equal(await page.getByLabel('用户名', { exact: true }).inputValue(), 'preview');
  pass('登录失败保留输入并显示内联错误');
  assert.ok(
    errors.every((message) => /401 \(Unauthorized\)/.test(message)),
    'Only the intentionally rejected login may log an HTTP error'
  );
  errors.length = 0;
  await page.getByLabel('密码', { exact: true }).fill('visual-preview-only');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL(`${preview.url}/admin`);
  await page.locator('#dash-root').waitFor();
  await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('#dash-visit-stats .stat').count(), 6);
  pass('真实登录、成功动画与仪表盘渲染');
  await page.screenshot({ path: path.join(out, 'dashboard.png'), fullPage: false });
  await page.getByRole('button', { name: '自动刷新间隔', exact: true }).click();
  await page.locator('.pearl-pop-select').waitFor();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.pearl-pop-select').count(), 0);
  pass('自定义下拉方向键与 Escape');
  await page.getByRole('button', { name: '外观设置', exact: true }).click();
  await page.getByRole('button', { name: '深色', exact: true }).click();
  await page.getByRole('button', { name: '紧凑', exact: true }).click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  assert.equal(await page.locator('html').getAttribute('data-density'), 'compact');
  await page.keyboard.press('Escape');
  await page.locator('.pearl-overlay').waitFor({ state: 'detached' });
  assert.equal(await page.locator('.app').evaluate((el) => el.inert), false);
  pass('主题、密度、Escape 与焦点恢复');
  await page.getByRole('button', { name: '外观设置', exact: true }).click();
  await page.getByRole('button', { name: '浅色', exact: true }).click();
  await page.getByRole('button', { name: '标准', exact: true }).click();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await page.locator('.pearl-overlay').waitFor({ state: 'detached' });
  await page.locator('#rail-toggle').click();
  assert.match(await page.locator('.app').getAttribute('class'), /is-collapsed/);
  await page.locator('#rail-toggle').click();
  pass('侧栏折叠与恢复');
  const routes = [
    'posts',
    'notes',
    'projects',
    'media',
    'site-content',
    'links',
    'music',
    'announcements',
    'comments',
    'site-stats',
    'build',
  ];
  for (const route of routes) {
    await page.locator(`.nav__item[href="/admin/${route}"]`).click();
    await page.waitForURL(`${preview.url}/admin/${route}`);
    await page.locator('.main').waitFor();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.main')).opacity === '1');
    assert.equal(await page.locator('.nav__item[aria-current="page"]').count(), 1);
  }
  pass('全部 11 个后台模块无刷新导航与活动菜单');
  await page.locator('.nav__item[href="/admin/posts"]').click();
  await page.waitForURL(`${preview.url}/admin/posts`);
  await page.getByRole('button', { name: '表格', exact: true }).click();
  assert.equal(await page.locator('.table tbody tr:visible').count(), 15);
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  assert.equal(await page.locator('.table tbody tr:visible').count(), 9);
  await page.getByRole('searchbox', { name: '筛选列表 1' }).fill('暖色');
  assert.equal(await page.locator('.table tbody tr:visible').count(), 6);
  await page.getByRole('searchbox', { name: '筛选列表 1' }).fill('');
  pass('列表筛选和分页');
  await page.getByRole('button', { name: '看板', exact: true }).click();
  assert.equal(await page.locator('.pearl-board-card:visible').count(), 24);
  await page.getByRole('button', { name: '矩阵', exact: true }).click();
  assert.equal(await page.locator('.pearl-matrix tbody tr:visible').count(), 24);
  await page.getByRole('button', { name: '时间线', exact: true }).click();
  assert.equal(await page.locator('.pearl-time-mark:visible').count(), 24);
  assert.equal(await page.locator('.pearl-lane:visible').count(), 3);
  await page.getByRole('button', { name: '关系图', exact: true }).click();
  await page.locator('.pearl-stage').waitFor();
  assert.equal(await page.locator('.pearl-node:visible').count(), 13);
  await page.locator('.pearl-node.is-hub').first().click();
  assert.match(await page.locator('.pearl-insight').innerText(), /8 项/);
  await page.getByRole('button', { name: '暂停画布动效', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '播放画布动效', exact: true }).count(), 1);
  await page.getByRole('button', { name: '放大画布', exact: true }).click();
  assert.match(await page.locator('.pearl-stage-layer').getAttribute('style'), /scale\(1.15\)/);
  await page.getByRole('button', { name: '重置画布', exact: true }).click();
  await page.screenshot({ path: path.join(out, 'content-graph.png') });
  pass('看板、矩阵、图谱下钻、暂停、缩放与重置');
  await page.getByRole('button', { name: '表格', exact: true }).click();
  await page.locator('[data-delete]').first().click();
  await page.getByRole('dialog', { name: '确认操作' }).waitFor();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.locator('.pearl-overlay').waitFor({ state: 'detached' });
  assert.equal(await page.locator('[data-delete]').count(), 24);
  pass('删除确认取消不会执行操作');
  await page.locator('.cell-title a').first().click();
  await page.waitForURL(/\/admin\/posts\/edit/);
  await page.getByRole('button', { name: '文章设置', exact: true }).click();
  await page.locator('.pearl-settings-drawer').waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  await page.locator('.pearl-settings-drawer').waitFor({ state: 'hidden' });
  await page.locator('[data-field="date"]').click();
  await page.locator('.picker-pop').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.picker-pop').count(), 0);
  pass('日历浮层打开与 Escape 关闭');
  await page.getByRole('button', { name: '预览', exact: true }).click();
  await page.locator('#preview').waitFor({ state: 'visible' });
  assert.match(await page.locator('#preview').innerText(), /视觉验收/);
  await page.getByRole('button', { name: '写作', exact: true }).click();
  await page.getByLabel('文章标题', { exact: true }).fill('尚未保存的视觉验收修改');
  await page.locator('.nav__item[href="/admin/notes"]').click();
  await page.getByRole('dialog', { name: '确认操作' }).waitFor();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.locator('.pearl-overlay').waitFor({ state: 'detached' });
  assert.match(page.url(), /posts\/edit/);
  assert.equal(await page.getByLabel('文章标题', { exact: true }).inputValue(), '尚未保存的视觉验收修改');
  await page.locator('.nav__item[href="/admin/notes"]').click();
  await page.getByRole('button', { name: '确认操作', exact: true }).click();
  await page.waitForURL(`${preview.url}/admin/notes`);
  pass('编辑器设置抽屉、Markdown 预览与未保存保护');
  await page.keyboard.press('Control+k');
  await page.locator('.command-input').waitFor();
  await page.locator('.command-input').fill('音乐');
  assert.equal(await page.locator('.command-row').count(), 1);
  await page.keyboard.press('Enter');
  await page.waitForURL(`${preview.url}/admin/music`);
  pass('命令面板键盘搜索并导航');
  await page.locator('.nav__item[href="/admin/links"]').click();
  await page.waitForURL(`${preview.url}/admin/links`);
  await page.getByRole('button', { name: '导航星图', exact: true }).click();
  assert.equal(await page.locator('.pearl-node.is-hub').count(), 2);
  assert.equal(await page.locator('.pearl-node:not(.is-hub)').count(), 3);
  pass('导航分类星图使用真实链接数据');
  await page.locator('.nav__item[href="/admin/site-content"]').click();
  await page.waitForURL(`${preview.url}/admin/site-content`);
  await page.locator('#p-hero-title').fill('隔离环境的修改');
  await page.locator('.pearl-floatbar').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await page.locator('.pearl-floatbar').waitFor({ state: 'hidden' });
  await page.locator('.pearl-toast').waitFor({ state: 'visible' });
  pass('真实保存成功清除修改浮条并显示 Toast');
  await page.locator('.nav__item[href="/admin/site-stats"]').click();
  await page.waitForURL(`${preview.url}/admin/site-stats`);
  assert.equal(await page.locator('.pearl-heat button').count(), 30);
  pass('每日访问热力使用真实日统计');
  await page.route('**/api/_', async (route) => {
    const target = decodeURIComponent(
      Buffer.from(route.request().headers()['x-target'] || '', 'base64').toString()
    );
    if (target === '/admin/posts') await delay(200);
    await route.continue();
  });
  await page.locator('.nav__item[href="/admin/posts"]').click();
  await page.locator('.nav__item[href="/admin/notes"]').click();
  await page.waitForURL(`${preview.url}/admin/notes`);
  await delay(300);
  assert.equal(await page.locator('.page__head h1').innerText(), '随笔');
  await page.unroute('**/api/_');
  pass('快速连续导航不会提交过期内容');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.nav__item[href="/admin/posts"]').click();
  await page.waitForURL(`${preview.url}/admin/posts`);
  await page.getByRole('button', { name: '关系图', exact: true }).click();
  await page.locator('.pearl-stage').waitFor();
  assert.equal(await page.locator('.main').evaluate((el) => getComputedStyle(el).opacity), '1');
  pass('减少动态效果时页面与画布保持可见');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator('.sidebar').evaluate((el) => getComputedStyle(el).flexDirection), 'column');
  await page.locator('#rail-toggle').click();
  assert.match(await page.locator('.app').getAttribute('class'), /is-mobile-open/);
  await page.locator('.nav__item[href="/admin/media"]').click();
  await page.waitForURL(`${preview.url}/admin/media`);
  assert.doesNotMatch(await page.locator('.app').getAttribute('class'), /is-mobile-open/);
  await page.waitForFunction(() => document.querySelector('.sidebar').getBoundingClientRect().right <= 1);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: path.join(out, 'mobile.png') });
  pass('390px 手机导航、遮罩收起与无横向溢出');
  assert.deepEqual(errors, []);
  pass('浏览器无运行时错误');
  console.log(`Admin visual regression: ${checks} checks passed. Screenshots: ${out}`);
} finally {
  await browser?.close();
  await preview.stop();
}
