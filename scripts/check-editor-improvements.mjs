// 浏览器验收只修改专用临时副本，不访问真实凭据和内容。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { startPreview } from './preview-admin.mjs';

const preview = startPreview({ port: 4428, quiet: true });
const output = path.resolve('.test-tmp/editor-improvements');
fs.mkdirSync(output, { recursive: true });
let browser;
try {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`${preview.url}/admin/login`)).ok) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto(`${preview.url}/admin/login`);
  await page.getByLabel('用户名', { exact: true }).fill('preview');
  await page.getByLabel('密码', { exact: true }).fill('visual-preview-only');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL(`${preview.url}/admin`);
  await page.goto(`${preview.url}/admin/site-content`);
  await page.locator('[data-content-tab="home"]').click({ timeout: 5000 });
  assert.equal(await page.locator('#p-hero-title').isVisible(), true);
  await page.locator('#p-hero-title').fill('分区保留的首页标题');
  await page.locator('[data-presentation-key="heroWords"]').fill('自定义打字标题');
  assert.equal(await page.locator('#p-hero-title').isDisabled(), true, '自定义轮换文字优先，备用标题应明确停用');
  await page.locator('[data-presentation-key="heroWords"]').fill('');
  assert.equal(await page.locator('#p-hero-title').isEnabled(), true);
  await page.locator('[data-content-tab="about"]').click();
  assert.equal(await page.locator('#p-hero-title').isVisible(), false);
  await page.locator('#p-about-lead').fill('关于页修改');
  await page.locator('#profile-save').click();
  await page.waitForTimeout(800);
  const saved = JSON.parse(fs.readFileSync(path.join(preview.sandbox, 'data/profile.json'), 'utf8'));
  assert.equal(saved.hero.title, '分区保留的首页标题');
  assert.equal(saved.about.lead, '关于页修改');
  await page.screenshot({ path: path.join(output, 'content-sections.png'), fullPage: true });
  await page.locator('[data-content-tab="home"]').click();
  await page.locator('.content-map').screenshot({ path: path.join(output, 'home-content-map.png') });

  await page.goto(`${preview.url}/admin/posts/new`);
  await page.locator('#markdown-file').setInputFiles({ name: '导入测试.md', mimeType: 'text/markdown', buffer: Buffer.from('---\ntitle: 本地导入验收\ndate: 2026-10-23\ntags: [导入, 测试]\n---\n\n## 本地正文\n\n导入完成。') });
  await page.waitForFunction(() => document.querySelector('[data-field="title"]').value === '本地导入验收');
  assert.match(await page.locator('#body').inputValue(), /导入完成/);
  assert.equal(await page.locator('[data-field="date"]').inputValue(), '2026-10-23');
  const importedBody = await page.locator('#body').inputValue();
  await page.locator('#body').fill('<figure class="post-figure post-figure--right post-figure--w50"><img src="/example.png" alt="对齐测试" /></figure>');
  await page.locator('[data-tab="preview"]').click();
  await page.locator('#preview figure').waitFor();
  assert.equal(await page.locator('#preview figure').evaluate((el) => getComputedStyle(el).alignItems), 'flex-end', '后台预览也应遵循靠右设置');
  await page.locator('[data-tab="write"]').click();
  await page.locator('#body').fill(importedBody);
  // 模拟一次保存失败，必须停留且保留全文；随后真实保存返回列表。
  await page.route('**/api/_', (route) => {
    const target = decodeURIComponent(Buffer.from(route.request().headers()['x-target'] || '', 'base64').toString());
    return target === '/api/save/posts' ? route.fulfill({ status: 500, json: { error: '模拟保存失败' } }) : route.continue();
  });
  await page.locator('#save-btn').click();
  await page.waitForFunction(() => !document.querySelector('#save-btn').disabled);
  assert.match(page.url(), /\/posts\/new/);
  assert.match(await page.locator('#body').inputValue(), /导入完成/);
  await page.unroute('**/api/_');
  await page.locator('#save-btn').click();
  await page.waitForURL(`${preview.url}/admin/posts`);
  assert.ok(fs.readdirSync(path.join(preview.sandbox, 'src/content/posts')).length > 24);

  await page.goto(`${preview.url}/admin/links`);
  assert.equal(await page.getByRole('button', { name: '添加分类' }).count(), 0);
  const originalCount = await page.locator('[data-cat-link]').count();
  assert.ok(originalCount >= 3, '旧分类中的链接必须全部可见');
  await page.locator('#nav-save').click();
  await page.waitForTimeout(400);
  const nav = JSON.parse(fs.readFileSync(path.join(preview.sandbox, 'data/nav.json'), 'utf8'));
  assert.equal(nav.categories.length, 1);
  assert.equal(nav.categories[0].links.length, originalCount);
  assert.ok(nav.categories[0].links.every((link) => link.icon));
  await page.locator('#friend-new').click();
  await page.locator('#friend-list-toggle').click({ timeout: 4000 });
  await page.locator('#friend-list-body').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#friend-list-toggle').isVisible(), true, '收起后展开入口必须留在列表标题栏');
  await page.locator('#friend-list-toggle').click();
  await page.locator('#friend-list-body').waitFor({ state: 'visible' });
  await page.locator('#fr-name').fill('手动添加验收');
  await page.locator('#fr-url').fill('https://manual.example.com');
  await page.locator('#friend-save').click();
  await page.getByRole('link', { name: '手动添加验收', exact: true }).waitFor();
  const friends = JSON.parse(fs.readFileSync(path.join(preview.sandbox, 'data/friends.json'), 'utf8'));
  assert.equal(friends.items.find((item) => item.name === '手动添加验收').status, 'approved');
  await page.goto(`${preview.url}/admin/projects`);
  await page.locator('#project-new').click();
  await page.locator('#project-ai summary').click();
  await page.locator('#project-ai-key').fill('fixture-only-key');
  await page.locator('#project-ai-save-key').click();
  await page.waitForFunction(() => document.querySelector('#project-ai-status').textContent.includes('已配置'));
  assert.equal(await page.locator('#project-ai-key').inputValue(), '', '保存后浏览器不应残留密钥明文');
  await page.locator('#project-ai-repository').fill('https://github.com/example/repository');
  await page.route('**/api/_', (route) => {
    const target = decodeURIComponent(Buffer.from(route.request().headers()['x-target'] || '', 'base64').toString());
    return target === '/api/manage/projects/ai/analyze' ? route.fulfill({ json: { draft: { title: 'AI 草稿验收', slug: 'ai-draft', subtitle: '介绍', description: '简介', tech: ['Astro'], links: [{ label: 'GitHub', url: 'https://github.com/example/repository' }], content: '## 项目说明' } } }) : route.continue();
  });
  await page.locator('#project-ai-analyze').click();
  await page.waitForFunction(() => document.querySelector('#pj-title').value === 'AI 草稿验收');
  assert.equal(JSON.parse(fs.readFileSync(path.join(preview.sandbox, 'data/projects.json'), 'utf8')).projects.length, 1, 'AI 预填不能自动落盘');
  await page.screenshot({ path: path.join(output, 'project-ai.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.querySelector('.sidebar').getBoundingClientRect().right <= 1);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '手机 AI 表单不应横向溢出');
  await page.screenshot({ path: path.join(output, 'project-ai-mobile.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS 页面分区跨区保存、Markdown 导入与失败保留/成功退出、导航合并图标、手动友链、AI 预填无自动保存');
} finally { await browser?.close(); await preview.stop(); }
