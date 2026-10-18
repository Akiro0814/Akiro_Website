// Isolated visual QA: generated content, temporary data and throwaway credentials.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function startPreview({ port = 4413, quiet = false } = {}) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-pearl-preview-'));
  fs.cpSync(path.join(root, 'admin'), path.join(sandbox, 'admin'), { recursive: true });
  fs.mkdirSync(path.join(sandbox, 'src', 'lib'), { recursive: true });
  fs.mkdirSync(path.join(sandbox, 'src', 'styles'), { recursive: true });
  fs.cpSync(path.join(root, 'src', 'lib'), path.join(sandbox, 'src', 'lib'), { recursive: true });
  fs.copyFileSync(
    path.join(root, 'src', 'styles', 'fonts.css'),
    path.join(sandbox, 'src', 'styles', 'fonts.css')
  );
  fs.writeFileSync(path.join(sandbox, 'package.json'), '{"type":"module"}');
  fs.symlinkSync(
    path.join(root, 'node_modules'),
    path.join(sandbox, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir'
  );
  fs.mkdirSync(path.join(sandbox, 'public'), { recursive: true });
  if (fs.existsSync(path.join(root, 'public', 'fonts')))
    fs.symlinkSync(
      path.join(root, 'public', 'fonts'),
      path.join(sandbox, 'public', 'fonts'),
      process.platform === 'win32' ? 'junction' : 'dir'
    );
  fs.mkdirSync(path.join(sandbox, 'data'), { recursive: true });
  for (const collection of ['posts', 'notes']) {
    const dir = path.join(sandbox, 'src', 'content', collection);
    fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < (collection === 'posts' ? 24 : 5); i++) {
      fs.writeFileSync(
        path.join(dir, `内容-${i + 1}.md`),
        `---\ntitle: ${['把日常写成一篇文章', '关于设计与留白', 'Astro 博客发布实践', '暖色界面的细节'][i % 4]} ${i + 1}\ndate: 2026-10-${String((i % 12) + 1).padStart(2, '0')}\ncategories: [${['技术', '设计', '生活'][i % 3]}]\ntags: [博客, 记录]\ndraft: ${i % 5 === 0}\n---\n\n这是用于视觉验收的独立示例文章。\n\n## 从这里开始\n\n保留想法，也保留细节。\n`
      );
    }
  }
  const days = {};
  for (let i = 0; i < 32; i++)
    days[new Date(Date.UTC(2026, 8, 12 + i)).toISOString().slice(0, 10)] = 20 + ((i * 37) % 160);
  fs.writeFileSync(
    path.join(sandbox, 'data', 'stats.json'),
    JSON.stringify({
      total: 3420,
      days,
      paths: { '/': { count: 1200, title: '首页' }, '/archive/': { count: 580, title: '文章归档' } },
      regions: { 中国: 1000 },
      sources: {},
      devices: {},
    })
  );
  fs.writeFileSync(
    path.join(sandbox, 'data', 'comments.json'),
    JSON.stringify([
      {
        id: 'preview-comment',
        nick: '示例读者',
        mail: 'reader@example.com',
        url: '/posts/内容-1/',
        commentMd: '这是一条用于验收的评论。',
        comment: '这是一条用于验收的评论。',
        created: Date.now(),
        status: 'visible',
        like: 3,
      },
    ])
  );
  fs.writeFileSync(
    path.join(sandbox, 'data', 'projects.json'),
    JSON.stringify({
      projects: [
        {
          id: 'preview-project',
          slug: 'preview',
          title: '个人博客',
          subtitle: '记录与分享',
          description: '用于视觉验收的示例项目',
          status: '已上线',
          tech: ['Astro', 'Node.js'],
          links: [],
          content: '项目介绍',
          order: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    })
  );
  fs.writeFileSync(
    path.join(sandbox, 'data', 'nav.json'),
    JSON.stringify({
      categories: [
        {
          id: 'dev',
          name: '开发工具',
          links: [
            { name: 'Astro', url: 'https://astro.build', desc: '站点框架' },
            { name: 'GitHub', url: 'https://github.com', desc: '代码托管' },
          ],
        },
        {
          id: 'design',
          name: '设计资源',
          links: [{ name: '设计笔记', url: 'https://example.org', desc: '示例入口' }],
        },
      ],
    })
  );
  fs.writeFileSync(
    path.join(sandbox, 'data', 'announcements.json'),
    JSON.stringify([
      {
        id: 'preview-ann',
        title: '欢迎来到博客',
        content: '独立预览环境',
        enabled: true,
        createdAt: Date.now(),
      },
    ])
  );
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync('visual-preview-only', salt, 64).toString('hex');
  const child = spawn(process.execPath, [path.join(sandbox, 'admin', 'server.mjs')], {
    cwd: sandbox,
    stdio: quiet ? 'ignore' : 'inherit',
    windowsHide: true,
    env: {
      ...process.env,
      ADMIN_PORT: String(port),
      ADMIN_USER: 'preview',
      ADMIN_PASSWORD_HASH: `${salt}:${hash}`,
      SESSION_SECRET: crypto.randomBytes(48).toString('hex'),
      COOKIE_SECURE: 'false',
      NODE_ENV: 'development',
      BACKUP_ENABLED: 'false',
      BLOG_DATA_DIR: path.join(sandbox, 'data'),
      PUBLIC_TWIKOO_ENV_ID: '',
      SITE_URL: `http://localhost:${port}`,
    },
  });
  if (!quiet) {
    console.log(`Isolated preview: http://localhost:${port}/admin — preview / visual-preview-only`);
    console.log(`Fixture: ${sandbox}`);
  }
  const cleanup = () => {
    const target = path.resolve(sandbox),
      parent = path.resolve(os.tmpdir());
    if (path.dirname(target) !== parent || !path.basename(target).startsWith('blog-pearl-preview-')) return;
    // Unlink junctions first so recursive cleanup never traverses the real workspace.
    for (const relative of ['node_modules', 'public/fonts']) {
      const link = path.join(target, relative);
      if (fs.lstatSync(link, { throwIfNoEntry: false })?.isSymbolicLink()) fs.unlinkSync(link);
    }
    fs.rmSync(target, { recursive: true, force: true });
  };
  child.on('exit', (code) => {
    cleanup();
    process.exitCode = code || 0;
  });
  return {
    child,
    sandbox,
    url: `http://localhost:${port}`,
    stop: () =>
      new Promise((resolve) => {
        if (child.exitCode !== null) {
          resolve();
          return;
        }
        child.once('exit', resolve);
        child.kill();
      }),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const preview = startPreview();
  process.on('SIGINT', () => preview.child.kill());
  process.on('SIGTERM', () => preview.child.kill());
}
