import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './env.mjs';

// search.json 与静态页面同属一个 release，且由 getPublishedPosts 生成。
// 每次跟随 current 读取，回滚会立即采用对应版本，不缓存源 Markdown 的数量。
// 复用已有发布产物，也能兼容修复前生成的 release，无需迁移真实内容或动态数据库。
export function publishedPostCount() {
  try {
    const items = JSON.parse(fs.readFileSync(path.join(ROOT, 'current', 'search.json'), 'utf8'));
    if (!Array.isArray(items)) return 0;
    return new Set(items.filter((item) => typeof item?.url === 'string' && item.url.startsWith('/posts/'))
      .map((item) => item.url)).size;
  } catch {
    // 首次发布前或失效发布链接不暴露源文件数量；不能把未发布内容当成公开内容。
    return 0;
  }
}
