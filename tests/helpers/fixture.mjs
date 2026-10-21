import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url));

// 测试只使用 fixture 内的数据，即使调用者设置了外部数据目录也不能写入它。
delete process.env.BLOG_DATA_DIR;
// 发布测试会采集官方评论服务；显式清除宿主的远程数据库和曲源配置，
// 防止调用者的环境变量把临时夹具指向真实评论库或外部歌单。
for (const key of ['TWIKOO_DATA', 'TWIKOO_ENV_ID', 'PUBLIC_TWIKOO_ENV_ID', 'TWIKOO_ADMIN_TOKEN', 'MONGODB_URI', 'MONGO_URL', 'PUBLIC_NETEASE_PLAYLIST_ID']) delete process.env[key];

export function createFixture(t) {
  const root = fs.mkdtempSync(path.join(PROJECT_ROOT, '.test-tmp-'));
  t.after(async () => {
    // 发布采集会初始化官方评论数据库，先排空并关闭，再清理独立夹具。
    const module = await import(pathToFileURL(path.join(root, 'admin/lib/twikoo.mjs')).href);
    await module.twikoo.close();
    assert.equal(path.dirname(root), path.resolve(PROJECT_ROOT));
    assert.ok(path.basename(root).startsWith('.test-tmp-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  fs.cpSync(path.join(PROJECT_ROOT, 'admin', 'lib'), path.join(root, 'admin', 'lib'), { recursive: true });
  // 后台与前台共用的配置契约也进入隔离夹具，避免测试误读真实工作区文件。
  fs.mkdirSync(path.join(root, 'src', 'lib'), { recursive: true });
  for (const name of ['media-url.js', 'presentation.js', 'github-repos.js', 'project-catalog.js', 'wallpapers.mjs']) fs.copyFileSync(path.join(PROJECT_ROOT, 'src', 'lib', name), path.join(root, 'src', 'lib', name));
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.copyFileSync(path.join(PROJECT_ROOT, 'scripts/prepare-release.mjs'), path.join(root, 'scripts/prepare-release.mjs'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    type: 'module', scripts: { build: 'node fixture-build.mjs' },
  }));
  fs.writeFileSync(path.join(root, 'fixture-build.mjs'), `
    import fs from 'node:fs';
    fs.mkdirSync('dist', { recursive: true });
    fs.writeFileSync('dist/index.html', '<html>new release</html>');
    fs.writeFileSync('dist/search.json', '[]');
  `);
  return {
    root,
    importModule: (name) => import(pathToFileURL(path.join(root, 'admin', 'lib', name)).href),
  };
}

export function addRelease(root, name, { current = false } = {}) {
  const dir = path.join(root, 'releases', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), `<html>${name}</html>`);
  if (current) fs.symlinkSync(dir, path.join(root, 'current'), process.platform === 'win32' ? 'junction' : 'dir');
  return dir;
}
