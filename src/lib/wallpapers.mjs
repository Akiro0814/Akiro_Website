import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const IMAGE_EXTENSION = /\.(?:jpe?g|png|webp|avif|gif)$/i;

// 仅读取固定的顶层壁纸目录，不接受请求提供的路径，也不跟随链接或 Windows junction。
export function readWallpapers(projectRoot = process.cwd()) {
  const publicDir = path.resolve(projectRoot, 'public');
  const dir = path.join(publicDir, 'wallpapers');
  try {
    for (const candidate of [publicDir, dir]) {
      const info = fs.lstatSync(candidate);
      if (!info.isDirectory() || info.isSymbolicLink()) return [];
    }
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && IMAGE_EXTENSION.test(entry.name) && !entry.name.startsWith('.'))
      .filter((entry) => {
        try {
          const info = fs.lstatSync(path.join(dir, entry.name));
          return info.isFile() && !info.isSymbolicLink();
        } catch { return false; }
      })
      .map((entry) => `/wallpapers/${encodeURIComponent(entry.name)}`)
      .sort();
  } catch {
    // 新克隆或目录暂不可读时仍可正常显示渐变首屏。
    return [];
  }
}
