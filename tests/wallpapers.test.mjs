import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { readWallpapers } from '../src/lib/wallpapers.mjs';
import { chooseWallpaper, initWallpapers } from '../src/scripts/site/wallpapers.js';

test('壁纸仅扫描普通图片文件，编码中文和特殊文件名，不遍历子目录或链接', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'akiro-wallpapers-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, 'public', 'wallpapers');
  fs.mkdirSync(dir, { recursive: true });
  for (const name of ['风景 #1.JPG', 'sea.webp', 'clip.mp4', 'script.svg', '.gitkeep']) fs.writeFileSync(path.join(dir, name), 'fixture');
  fs.mkdirSync(path.join(dir, 'nested'));
  fs.writeFileSync(path.join(dir, 'nested', 'private.png'), 'fixture');
  const outside = path.join(root, 'outside');
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'private.jpg'), 'fixture');
  fs.symlinkSync(outside, path.join(dir, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.deepEqual(readWallpapers(root).sort(), ['/wallpapers/sea.webp', `/wallpapers/${encodeURIComponent('风景 #1.JPG')}`].sort());
  assert.deepEqual(readWallpapers(path.join(root, 'missing')), []);
});

test('壁纸目录本身是 junction 或符号链接时不扫描外部文件', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'akiro-wallpapers-link-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'public'));
  fs.mkdirSync(path.join(root, 'outside'));
  fs.writeFileSync(path.join(root, 'outside', 'private.jpg'), 'fixture');
  fs.symlinkSync(path.join(root, 'outside'), path.join(root, 'public', 'wallpapers'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.deepEqual(readWallpapers(root), []);
});

test('每次进入重新选择壁纸，多图时排除上次选择，并拒绝目录穿越及外部 URL', () => {
  const urls = ['/wallpapers/a.jpg', '/wallpapers/b.png'];
  assert.equal(chooseWallpaper(urls, '/wallpapers/a.jpg', () => 0), '/wallpapers/b.png');
  assert.equal(chooseWallpaper(urls, '', () => .99), '/wallpapers/b.png');
  assert.equal(chooseWallpaper(['/wallpapers/a.jpg'], '/wallpapers/a.jpg'), '/wallpapers/a.jpg');
  assert.equal(chooseWallpaper(['/wallpapers/%2e%2e%2fsecret.jpg', 'https://other.test/a.jpg', '/wallpapers/sub/a.jpg', '/wallpapers/a.svg']), '');
  assert.equal(chooseWallpaper([]), '');
});

test('媒体发生错误后，旧动效设置的 hidden 状态不会遮住已加载的回退图片', async (t) => {
  const media = new EventTarget();
  Object.assign(media, { tagName: 'IMG', hidden: true, src: '', setAttribute(name, value) { this[name] = value; } });
  const host = { dataset: { wallpaperList: '["/wallpapers/a.jpg"]', wallpaperFallback: '/uploads/fallback.jpg' }, isConnected: true, querySelector: () => media };
  const originals = new Map(['document', 'window', 'sessionStorage'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => { for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  globalThis.document = { querySelector: () => host };
  globalThis.window = { __blogApi: { gateFetch: () => Promise.resolve(null) } };
  globalThis.sessionStorage = { getItem: () => '', setItem() {} };
  initWallpapers(new AbortController().signal);
  assert.equal(media.hidden, false);
  // 模拟 motion.js 在壁纸自身错误处理之后把同一图片隐藏。
  media.addEventListener('error', () => { media.hidden = true; });
  media.dispatchEvent(new Event('error'));
  await Promise.resolve();
  assert.equal(media.src, '/uploads/fallback.jpg');
  media.dispatchEvent(new Event('load'));
  assert.equal(media.hidden, false);
});
