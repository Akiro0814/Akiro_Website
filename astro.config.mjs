import { defineConfig } from 'astro/config';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { unified } from '@astrojs/markdown-remark';
import { loadEnv, ROOT } from './admin/lib/env.mjs';
import { TWIKOO_VERSION } from './src/lib/twikoo-version.js';
import rehypeImgAttrs from './src/lib/rehype-img-attrs.mjs';
import rehypeLegacyShortcodes from './src/lib/rehype-legacy-shortcodes.mjs';
import remarkLegacyShortcodes from './src/lib/remark-legacy-shortcodes.mjs';

// 构建期配置校验：SITE_URL 用于 RSS / sitemap / canonical / 页脚站点链接，
// 未配置或仍是占位符时给出醒目警告（页脚会隐藏站点链接区块，不渲染占位 URL）。
loadEnv();
// 官方 UMD 必须作为原始静态脚本提供，不能让开发服务器改写成 ESM。
// 通过 Node 模块解析定位依赖，隔离构建也可从祖先 node_modules 正确找到包。
const require = createRequire(import.meta.url);
const twikooDist = path.dirname(require.resolve('twikoo'));
const installedTwikoo = JSON.parse(fs.readFileSync(path.join(twikooDist, '..', 'package.json'), 'utf8'));
if (installedTwikoo.version !== TWIKOO_VERSION) throw Error('Twikoo 前端版本与集成版本不一致，请同步升级配置。');
const vendorDir = path.join(ROOT, 'public', 'vendor');
fs.mkdirSync(vendorDir, { recursive: true });
const sdkTarget = path.join(vendorDir, `twikoo-${TWIKOO_VERSION}.js`);
const sdkSource = fs.readFileSync(path.join(twikooDist, 'twikoo.nocss.js'));
if (!fs.existsSync(sdkTarget) || !fs.readFileSync(sdkTarget).equals(sdkSource)) fs.writeFileSync(sdkTarget, sdkSource);
const sdkLicense = path.join(vendorDir, `twikoo-${TWIKOO_VERSION}.LICENSE.txt`);
const licenseSource = fs.readFileSync(path.join(twikooDist, '..', 'LICENSE'));
if (!fs.existsSync(sdkLicense) || !fs.readFileSync(sdkLicense).equals(licenseSource)) fs.writeFileSync(sdkLicense, licenseSource);
const SITE_URL = process.env.SITE_URL ?? 'https://example.com';
if (!process.env.SITE_URL || /example\.(com|org|net)|localhost/i.test(SITE_URL)) {
  console.warn(
    `[astro.config] ⚠ SITE_URL 未配置或仍是占位符（当前：${SITE_URL}）。\n` +
      '  RSS / sitemap / canonical 将使用该值，请在 .env 的 SITE_URL 填写正式域名。',
  );
}

export default defineConfig({
  site: SITE_URL,
  markdown: {
    processor: unified({
      remarkPlugins: [remarkLegacyShortcodes],
      // rehypeImgAttrs：图片加载加固（lazy/decoding/防盗链），并把独占一段的
      // 图片升级为 <figure>——Markdown 图片的 "标题" 位渲染为居中图注。
      rehypePlugins: [rehypeLegacyShortcodes, rehypeImgAttrs],
    }),
  },
  vite: {
    resolve: { alias: { '@twikoo-sdk': twikooDist } },
    server: {
      // Windows 开发监视器会占用目录句柄，必须避开隔离测试与发布产物，
      // 否则 dist -> releases 的原子移动会被长期阻塞。
      watch: {
        ignored: ['**/.test-tmp-*/**', '**/releases/**', '**/current/**', '**/dist/**', '**/data/twikoo/**', '**/data/github-projects.json'],
      },
      // 本地开发时把动态接口转发到后台服务（npm run admin），与生产环境
      // nginx 反代 /api 的效果一致；目标端口随 .env 的 ADMIN_PORT 走。
      proxy: {
        '/api': `http://localhost:${process.env.ADMIN_PORT || 4000}`,
      },
    },
  },
});
