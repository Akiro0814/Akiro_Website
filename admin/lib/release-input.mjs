import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './env.mjs';
import { DATA_DIR } from './store.mjs';

// 所有复制在同一事件循环片段内完成。只复制应用构建所需文件；不递归进入
// node_modules/current/releases，也不将数据库、会话、.env 与备份密钥带入副本。
export function createReleaseInput(comments) {
  const workspace = path.join(ROOT, '.build-lock', 'workspace');
  fs.mkdirSync(workspace, { recursive: true });
  for (const name of ['src', 'public', 'admin', 'scripts', 'package.json', 'astro.config.mjs', 'tsconfig.json', 'fixture-build.mjs']) {
    const from = path.join(ROOT, name);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(workspace, name), { recursive: true, dereference: true });
  }
  const data = path.join(workspace, 'data');
  fs.mkdirSync(data);
  for (const name of ['profile.json', 'nav.json', 'friends.json', 'announcements.json', 'projects.json', 'music.json', 'stats.json', 'site-meta.json', 'github-projects.json', 'music-files']) {
    const from = path.join(DATA_DIR, name);
    if (fs.existsSync(from)) {
      // 已存在但损坏的 JSON 不能被底层默认值静默覆盖后发布为空站点。
      if (name.endsWith('.json')) JSON.parse(fs.readFileSync(from, 'utf8'));
      fs.cpSync(from, path.join(data, name), { recursive: true, dereference: true });
    }
  }
  fs.writeFileSync(path.join(data, 'published-comments.json'), JSON.stringify(comments));
  return workspace;
}

export function completeReleaseInput(workspace) {
  const dist = path.join(workspace, 'dist');
  const stateFile = path.join(workspace, 'data/release-state.json');
  if (!fs.existsSync(stateFile)) throw Error('缺少公开数据快照，未发布。');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  // 文章量直接校验本次静态输出，避免再次查询工作区内容。
  const search = JSON.parse(fs.readFileSync(path.join(dist, 'search.json'), 'utf8'));
  state.stats.posts = new Set(search.filter((item) => item.url?.startsWith('/posts/')).map((item) => item.url)).size;
  const dest = path.join(dist, '_published');
  fs.mkdirSync(dest, { recursive: true });
  for (const track of state.tracks.filter((t) => t.source === 'local')) {
    if (!track.fileName || path.basename(track.fileName) !== track.fileName) throw Error('本地音频名称无效，未发布。');
    fs.mkdirSync(path.join(dest, 'music'), { recursive: true });
    fs.copyFileSync(path.join(workspace, 'data/music-files', track.fileName), path.join(dest, 'music', track.fileName));
  }
  fs.writeFileSync(path.join(dest, 'state.json'), JSON.stringify(state));
  return dist;
}
