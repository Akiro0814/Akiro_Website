import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { createFixture, PROJECT_ROOT } from './helpers/fixture.mjs';

test('实际 Astro 构建：中文 URL、图注、草稿隔离与删除后发布', { timeout: 60_000 }, async (t) => {
  const fixture = createFixture(t);
  const { root } = fixture;
  const sourceContent = path.join(PROJECT_ROOT, 'src', 'content');
  fs.cpSync(path.join(PROJECT_ROOT, 'src'), path.join(root, 'src'), {
    recursive: true, filter: (file) => file !== sourceContent && !file.startsWith(sourceContent + path.sep),
  });
  const configFile = path.join(root, 'src', 'data', 'site.config.json');
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  config.githubUser = ''; // 构建测试不请求外部 GitHub。
  fs.writeFileSync(configFile, JSON.stringify(config));
  for (const file of ['astro.config.mjs', 'tsconfig.json']) fs.copyFileSync(path.join(PROJECT_ROOT, file), path.join(root, file));
  fs.cpSync(path.join(PROJECT_ROOT, 'public', 'fonts'), path.join(root, 'public', 'fonts'), { recursive: true });
  // 构建夹具只复制公共兜底资源，不复制作者的封面或上传素材。
  fs.mkdirSync(path.join(root, 'public', 'covers'), { recursive: true });
  fs.copyFileSync(path.join(PROJECT_ROOT, 'public', 'covers', 'fallback.svg'), path.join(root, 'public', 'covers', 'fallback.svg'));
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.cpSync(path.join(PROJECT_ROOT, 'scripts', 'check-dist.mjs'), path.join(root, 'scripts', 'check-dist.mjs'));
  fs.mkdirSync(path.join(root, 'src', 'content', 'posts', '技术'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'content', 'notes'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'content', 'posts', '技术', '中文文章.md'), `---
title: 中文回归文章
date: 2026-10-11
categories: [回归分类]
tags: [回归标签]
---
## 正文章节
公开正文。

![图片说明](/test-cover.jpg "回归图注")
`);
  fs.writeFileSync(path.join(root, 'src', 'content', 'posts', '未发布.md'), `---
title: DRAFT_ONLY_SECRET_TITLE
draft: true
categories: [DRAFT_ONLY_CATEGORY]
tags: [DRAFT_ONLY_TAG]
---
DRAFT_ONLY_SECRET_BODY
`);
  fs.writeFileSync(path.join(root, 'src', 'content', 'notes', '草稿.md'), '---\ndate: 2026-10-11\ndraft: true\n---\nDRAFT_ONLY_SECRET_NOTE');
  fs.writeFileSync(path.join(root, '.env'), 'SITE_URL=https://blog.test\nADMIN_PORT=4567\n');
  // 验证真正的后台存储契约进入 Astro 构建，而非仅检查表单字段存在。
  const { saveProfile } = await fixture.importModule('site-data.mjs');
  await saveProfile({
    presentation: { siteName: '配置回归站点', author: '配置作者', heroWords: ['后台轮换第一句', '后台轮换第二句'], writingTitle: '后台配置文章区', quoteText: '后台保存的首页结语', showStatus: false, showProjects: false, defaultStyle: 'glass', defaultTheme: 'dark', wallpaperMode: 'gradient', navItems: ['/notes/'] },
    hero: { socials: [] }, footer: { links: [] },
  });
  const env = { ...process.env, PUBLIC_NETEASE_PLAYLIST_ID: '', PUBLIC_TWIKOO_ENV_ID: '' };
  delete env.SITE_URL;
  delete env.ADMIN_PORT;
  const astroBin = path.join(PROJECT_ROOT, 'node_modules', 'astro', 'bin', 'astro.mjs');
  const built = spawnSync(process.execPath, [astroBin, 'build'], {
    cwd: root, encoding: 'utf8', timeout: 45_000, windowsHide: true,
    env,
  });
  assert.equal(built.status, 0, built.error?.message || built.stdout + built.stderr);
  const homepage = fs.readFileSync(path.join(root, 'dist', 'index.html'), 'utf8');
  assert.match(homepage, /配置回归站点/);
  assert.match(homepage, /配置作者/);
  assert.match(homepage, /aria-label="后台轮换第一句"/);
  assert.match(homepage, /后台配置文章区/);
  assert.match(homepage, /后台保存的首页结语/);
  assert.match(homepage, /data-default-style="glass"/);
  assert.match(homepage, /data-default-theme="dark"/);
  assert.match(homepage, /data-wallpaper-mode="gradient"/);
  assert.doesNotMatch(homepage, /class="atlas-section atlas-status-section"/);
  assert.doesNotMatch(homepage, /class="atlas-social-dock"[^>]*>[\s]*<a/);
  assert.doesNotMatch(built.stdout + built.stderr, /SITE_URL 未配置|markdown\.remarkPlugins/);
  const article = fs.readFileSync(path.join(root, 'dist', 'posts', '技术', '中文文章', 'index.html'), 'utf8');
  assert.match(article, /公开正文/);
  assert.match(article, /https:\/\/blog\.test\//);
  assert.match(article, /<figcaption[^>]*>回归图注<\/figcaption>/);
  const files = ['index.html', 'archive/index.html', 'notes/index.html', 'search.json', 'rss.xml', 'sitemap.xml'];
  for (const file of files) assert.doesNotMatch(fs.readFileSync(path.join(root, 'dist', file), 'utf8'), /DRAFT_ONLY_SECRET|DRAFT_ONLY_CATEGORY|DRAFT_ONLY_TAG/, file);
  assert.equal(fs.existsSync(path.join(root, 'dist', 'posts', '未发布')), false);
  assert.equal(fs.existsSync(path.join(root, 'dist', 'categories', 'DRAFT_ONLY_CATEGORY')), false);
  assert.equal(fs.existsSync(path.join(root, 'dist', 'tags', 'DRAFT_ONLY_TAG')), false);
  const checked = spawnSync(process.execPath, ['scripts/check-dist.mjs'], { cwd: root, encoding: 'utf8', windowsHide: true });
  assert.equal(checked.status, 0, checked.stdout + checked.stderr);

  // 通过真实发布流水线重建，验证删除检测会清理 Astro 缓存，旧文章不会复活。
  fs.writeFileSync(path.join(root, '.content-build-manifest.json'), JSON.stringify(['src/content/posts/技术/中文文章.md']));
  fs.unlinkSync(path.join(root, 'src', 'content', 'posts', '技术', '中文文章.md'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ type: 'module', scripts: { build: 'astro build' } }));
  process.env.BACKUP_ENABLED = 'false';
  const { buildAndPublish } = await fixture.importModule('build.mjs');
  const published = await buildAndPublish();
  assert.equal(published.ok, true, published.log);
  assert.equal(published.cacheRebuilt, true);
  assert.equal(fs.existsSync(path.join(root, 'current', 'posts', '技术', '中文文章')), false);
  for (const file of files) assert.doesNotMatch(fs.readFileSync(path.join(root, 'current', file), 'utf8'), /中文回归文章|DRAFT_ONLY_SECRET/, file);
});
