import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import { loadEnv } from './admin/lib/env.mjs';
import rehypeImgAttrs from './src/lib/rehype-img-attrs.mjs';
import rehypeLegacyShortcodes from './src/lib/rehype-legacy-shortcodes.mjs';
import remarkLegacyShortcodes from './src/lib/remark-legacy-shortcodes.mjs';

// 构建期配置校验：SITE_URL 用于 RSS / sitemap / canonical / 页脚站点链接，
// 未配置或仍是占位符时给出醒目警告（页脚会隐藏站点链接区块，不渲染占位 URL）。
loadEnv();
const SITE_URL = process.env.SITE_URL ?? 'https://example.com';
if (!process.env.SITE_URL || /example\.(com|org|net)|localhost/i.test(SITE_URL)) {
  console.warn(
    `[astro.config] ⚠ SITE_URL 未配置或仍是占位符（当前：${SITE_URL}）。\n` +
      '  RSS / sitemap / canonical 将使用该值，请在 .env 的 SITE_URL 填写正式域名。',
  );
}

export default defineConfig({
  site: SITE_URL,
  // 只在访客表达导航意图时预取同站页面，复用 Astro 的去重缓存与省流量判断。
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  markdown: {
    processor: unified({
      remarkPlugins: [remarkLegacyShortcodes],
      // rehypeImgAttrs：图片加载加固（lazy/decoding/防盗链），并把独占一段的
      // 图片升级为 <figure>——Markdown 图片的 "标题" 位渲染为居中图注。
      rehypePlugins: [rehypeLegacyShortcodes, rehypeImgAttrs],
    }),
  },
  vite: {
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
