import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './env.mjs';

// 每次按 current 解析，绝不回退到 data/。以真实 release 路径作为缓存键，
// 发布与回滚不需要重启后台，也不会继续提供上个版本的公开数据。
let cached;
export function readPublishedState(releaseRoot = publishedRoot()) {
  try {
    if (!releaseRoot) return null;
    const file = fs.realpathSync(path.join(releaseRoot, '_published', 'state.json'));
    if (cached?.file === file) return structuredClone(cached.state);
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (state?.version !== 1) return null;
    cached = { file, state };
    return structuredClone(state);
  } catch { return null; }
}

// 将请求固定到同一个 release 后再定位文件，避免切换链接时清单和资源串版。
export function publishedRoot() {
  try { return fs.realpathSync(path.join(ROOT, 'current')); }
  catch { return null; }
}
