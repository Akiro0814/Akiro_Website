import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// 正常内容和空博客都在独立副本测试，绝不使用真实文章作为 UI 测试前置条件。
// 依赖复制为实体目录：Astro/Vite/发布会写缓存，不能通过 junction 共享原目录。
export function createPublicFixture({ sourceRoot = PROJECT_ROOT, scenario = 'normal' } = {}) {
  if (!['normal', 'empty'].includes(scenario)) throw new Error('未知的公开 UI 测试场景');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-public-ui-'));
  const cleanup = () => {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('blog-public-ui-')) throw new Error('拒绝清理非测试目录');
    fs.rmSync(root, { recursive: true, force: true });
  };
  try {
    for (const relative of ['admin', 'src', 'public', 'scripts', 'astro.config.mjs', 'tsconfig.json', 'package.json', 'package-lock.json', 'node_modules']) {
      const source = path.join(sourceRoot, relative);
      if (!fs.existsSync(source)) continue;
      fs.cpSync(source, path.join(root, relative), { recursive: true, dereference: true, filter: (file) => {
        const rel = path.relative(sourceRoot, file).replaceAll('\\', '/');
        return !/^(src\/content|public\/(uploads|wallpapers|avatars))(\/|$)/.test(rel) &&
          !/(^|\/)(\.astro|\.vite|\.env(?:\.[^/]*)?)(\/|$)/.test(rel);
      } });
    }
    const write = (relative, value) => {
      const file = path.join(root, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
    };
    for (const collection of ['posts', 'notes']) fs.mkdirSync(path.join(root, 'src/content', collection), { recursive: true });
    write('src/data/site.config.json', { siteName: '虚构测试博客', siteAuthor: '测试作者', siteDescription: '', githubUser: '', githubRepo: '', projectGroups: [], projectOverrides: {} });
    write('src/data/github-projects.json', []);
    write('public/avatars/ui-fixture.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="16" fill="#a65f40"/></svg>');
    write('data/profile.json', { presentation: { siteName: '虚构测试博客', author: '测试作者', avatar: '/avatars/ui-fixture.svg' }, hero: { title: '虚构测试首页', socials: [] }, about: { socials: [] }, footer: { links: [] } });
    write('data/announcements.json', []);
    write('data/projects.json', { projects: [] });
    if (scenario === 'normal') {
      for (let i = 0; i < 12; i++) write(`src/content/posts/fixture-${i}.md`,
        `---\ntitle: 虚构回归文章 ${i}\ndate: 2026-10-20\ncategories: [测试分类]\ntags: [测试标签]\n---\n` +
        [1, 2, 3, 4].map((chapter) => `\n## 章节 ${chapter}\n\n${'这是用于目录锚点和阅读布局的虚构中文段落。 '.repeat(80)}\n`).join(''));
      write('data/projects.json', { projects: [{ id: 'fixture-project', slug: 'test', title: '虚构回归项目', description: '本地离线项目', tech: ['Astro'], content: '## 虚构项目正文', links: [] }] });
    }
    return { root, cleanup };
  } catch (error) { cleanup(); throw error; }
}

export async function runInPublicFixture(scriptUrl, { scenario = 'normal' } = {}) {
  // 只有父进程为该副本设置的完整绝对路径匹配，子进程才直接运行实际断言。
  if (process.env.BLOG_UI_FIXTURE_ROOT === process.cwd()) return;
  const fixture = createPublicFixture({ scenario });
  const relative = path.relative(PROJECT_ROOT, fileURLToPath(scriptUrl));
  const output = path.resolve(process.env.UI_EVIDENCE_DIR || 'docs/testing/ui', `${path.basename(relative, '.mjs')}-${Date.now()}`);
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^(ADMIN_|SESSION_|TWIKOO|MONGO|BLOG_|BACKUP_|PUBLIC_)/.test(key) || key === 'NODE_OPTIONS') delete env[key];
  Object.assign(env, { BLOG_UI_FIXTURE_ROOT: fixture.root, SITE_URL: 'http://127.0.0.1:4331', ADMIN_PORT: '4599', BACKUP_ENABLED: 'false', ASTRO_DEV_BACKGROUND: '1' });
  let code = 1;
  try {
    const child = spawn(process.execPath, [path.join(fixture.root, relative)], { cwd: fixture.root, env, stdio: 'inherit', windowsHide: true });
    code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (status) => resolve(status ?? 1)); });
  } finally {
    try {
      const screenshots = path.join(fixture.root, 'docs/assets/spring-ui');
      if (fs.existsSync(screenshots)) { fs.mkdirSync(output, { recursive: true }); fs.cpSync(screenshots, output, { recursive: true }); }
    } finally {
      // 即使证据目录写入失败，也不能遗留包含测试内容和依赖的临时副本。
      fixture.cleanup();
    }
  }
  process.exit(code);
}

// 等待真实页面/模块和网络稳定后才执行 evaluate，避免初次内容同步产生的导航竞态。
// 不捕获并重试 execution-context 错误，新的异常仍会使测试失败。
export async function gotoStable(page, url, selector = 'main') {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator(selector).waitFor();
  await page.waitForFunction(() => document.readyState === 'complete');
  await page.evaluate(() => document.fonts.ready);
}
