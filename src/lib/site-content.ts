// 构建时读取后台维护的页面内容（data/profile.json：主页首屏 + 关于页文案）。
// 文件由后台「页面内容」模块写入，「构建发布」时在此被读取进静态页面。
// 文件缺失时回退到与初始页面一致的默认文案，保证干净克隆也能正常构建。
import fs from 'node:fs';
import path from 'node:path';
import { normalizeMediaUrl } from './media-url.js';
import { normalizePresentation } from './presentation.js';

export interface SocialLink {
  icon: string;
  label: string;
  href: string;
}

export interface HeroContent {
  backgroundUrl: string;
  eyebrow: string;
  title: string;
  bio: string;
  actionLabel: string;
  actionHref: string;
  socials: SocialLink[];
}

export interface AboutContent {
  lead: string;
  subs: string[];
  facts: string[];
  socials: SocialLink[];
}

export interface FooterLink {
  icon: string;
  label: string;
  // 为空时前台渲染为纯文字胶囊（如 QQ / 微信交流群）
  href: string;
}

export interface FooterContent {
  tagline: string;
  links: FooterLink[];
  // 支持 {year} / {author} 占位符，渲染时替换
  copyright: string;
  // 允许极小 HTML 子集（<a href>、<em>、<strong>），后台保存时已白名单净化
  attribution: string;
}

const DEFAULT_HERO: HeroContent = {
  backgroundUrl: '',
  eyebrow: 'AI · Code · Web',
  title: '你好，我是Akiro',
  bio: '这里记录 AI 工具、代码实践、网站搭建和一些技术观察。文章偏实用，也保留个人判断。',
  actionLabel: '浏览文章',
  actionHref: '/archive/',
  socials: [
    { icon: 'bilibili', label: 'Bilibili', href: 'https://space.bilibili.com/3493079350774423' },
    { icon: 'douyin', label: '抖音', href: 'https://v.douyin.com/vYbOd6pqFJw/' },
    { icon: 'github', label: 'GitHub', href: 'https://github.com/Akiro0814' },
    { icon: 'rss', label: 'RSS', href: '/rss.xml' },
  ],
};

const DEFAULT_ABOUT: AboutContent = {
  lead: '比起追新，我更在意一个工具<em>到底好不好用</em>。',
  subs: [
    '这里大多是亲手用过、踩过坑之后的实践笔记 —— 偏实用，也保留个人判断。',
    '而这个网站本身，从设计到每一行代码，<em>全部由 AI 开发完成</em> —— 也算是对「到底好不好用」的一份现场答卷。',
  ],
  facts: ['全站由 AI 开发'],
  socials: [
    { icon: 'bilibili', label: 'Bilibili', href: 'https://space.bilibili.com/3493079350774423' },
    { icon: 'github', label: 'GitHub', href: 'https://github.com/Akiro0814' },
    { icon: 'rss', label: 'RSS', href: '/rss.xml' },
  ],
};

const DEFAULT_FOOTER: FooterContent = {
  tagline: 'AI · Code · Web',
  links: [
    { icon: 'bilibili', label: 'Bilibili', href: 'https://space.bilibili.com/3493079350774423' },
    { icon: 'github', label: 'GitHub', href: 'https://github.com/Akiro0814' },
    { icon: 'rss', label: 'RSS', href: '/rss.xml' },
    { icon: 'qq', label: 'QQ 交流群', href: '' },
    { icon: 'wechat', label: '微信交流群', href: '' },
  ],
  copyright: '© {year} {author}',
  attribution:
    '由 <a href="https://astro.build" target="_blank" rel="noopener noreferrer">Astro</a> 构建',
};

interface ProfileFile {
  presentation?: Record<string, unknown>;
  hero?: Partial<HeroContent>;
  about?: Partial<AboutContent>;
  footer?: Partial<FooterContent>;
}

type ProfileContent = { hero: HeroContent; about: AboutContent; footer: FooterContent; presentation: ReturnType<typeof normalizePresentation> };
let cached: { mtimeMs: number; data: ProfileContent } | null = null;

function readProfile(): ProfileContent {
  // 按文件 mtime 缓存：dev 下后台改了 data/profile.json 无需重启 dev server，
  // 下一次读取即生效；构建期多次读取仍走缓存。
  const file = path.join(process.cwd(), 'data', 'profile.json');
  let mtimeMs = 0;
  try {
    mtimeMs = fs.statSync(file).mtimeMs;
  } catch {
    // 文件不存在时 mtime 记 0，缓存键稳定。
  }
  if (cached && cached.mtimeMs === mtimeMs) return cached.data;
  let saved: ProfileFile = {};
  try {
    if (fs.existsSync(file)) {
      saved = JSON.parse(fs.readFileSync(file, 'utf8')) as ProfileFile;
    }
  } catch {
    // 数据损坏时用默认文案，构建不中断。
  }
  const data = {
    presentation: normalizePresentation(saved.presentation),
    hero: { ...DEFAULT_HERO, ...saved.hero, backgroundUrl: normalizeMediaUrl(saved.hero?.backgroundUrl), socials: Array.isArray(saved.hero?.socials) ? saved.hero.socials : DEFAULT_HERO.socials },
    about: { ...DEFAULT_ABOUT, ...saved.about, subs: Array.isArray(saved.about?.subs) ? saved.about.subs : DEFAULT_ABOUT.subs, facts: Array.isArray(saved.about?.facts) ? saved.about.facts : DEFAULT_ABOUT.facts, socials: Array.isArray(saved.about?.socials) ? saved.about.socials : DEFAULT_ABOUT.socials },
    footer: {
      ...DEFAULT_FOOTER,
      ...saved.footer,
      // 逐条补齐字段并过滤空名称，避免旧数据/手改数据缺字段导致渲染异常。
      links: (Array.isArray(saved.footer?.links) ? saved.footer.links : DEFAULT_FOOTER.links)
        .map((l) => ({ icon: l?.icon ?? '', label: String(l?.label ?? ''), href: String(l?.href ?? '') }))
        .filter((l) => l.label),
    },
  };
  cached = { mtimeMs, data };
  return data;
}

export const getHero = (): HeroContent => readProfile().hero;
export const getAbout = (): AboutContent => readProfile().about;
export const getFooter = (): FooterContent => readProfile().footer;
export const getPresentation = () => readProfile().presentation;

// —— 项目展示（data/projects.json，后台「项目」模块维护） ——
export interface ProjectLink {
  label: string;
  url: string;
}

export interface ProjectItem {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  cover: string;
  status: string;
  tech: string[];
  links: ProjectLink[];
  featured: boolean;
  order: number;
  content: string;
  createdAt: number;
  updatedAt: number;
}

// data/ 目录下的 JSON 读取：文件名全部为内部字面量常量，缺失/损坏时回退默认值。
function dataDir(): string {
  return path.resolve(process.cwd(), 'data');
}

function readDataJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export function getProjects(): ProjectItem[] {
  const saved = readDataJson<{ projects?: ProjectItem[] }>(
    path.join(dataDir(), 'projects.json'),
    { projects: [] },
  );
  return (saved.projects ?? [])
    .filter((p) => Boolean(p && p.title && p.slug))
    .map((p) => ({ ...p, tech: p.tech ?? [], links: p.links ?? [] }))
    .sort((a, b) => (b.order ?? 0) - (a.order ?? 0) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

// —— 网址导航（data/nav.json，后台「网址导航」模块维护） ——
export interface NavLink {
  name: string;
  url: string;
  desc: string;
  icon: string;
}

export interface NavCategory {
  id: string;
  name: string;
  links: NavLink[];
}

export function getNavCategories(): NavCategory[] {
  const saved = readDataJson<{ categories?: NavCategory[] }>(
    path.join(dataDir(), 'nav.json'),
    { categories: [] },
  );
  return (saved.categories ?? []).filter((c) => Boolean(c && c.name && Array.isArray(c.links)));
}

// —— 站点数据（data/site-meta.json：后台「站点数据」页设定的开站日期） ——
export interface SiteMeta {
  // 开站日期 YYYY-MM-DD；未设置为空字符串。
  since: string;
}

export function getSiteMeta(): SiteMeta {
  const saved = readDataJson<{ since?: string }>(path.join(dataDir(), 'site-meta.json'), { since: '' });
  return { since: String(saved.since ?? '').trim().slice(0, 10) };
}

// —— 前台「网站数据」模块的构建期兜底快照 ——
// 公开 API 与 HTML 使用同一发布快照；静态预览 / 接口不可用时展示构建时刻
// 的快照。日界线与 admin/lib/stats.mjs 一致（北京时间 00:00）。
export interface SiteStatsSnapshot {
  since: string;
  comments: number;
  totalViews: number;
  todayViews: number;
}

export function getSiteStatsSnapshot(): SiteStatsSnapshot {
  // 正式发布的 HTML 与公开 API 使用同一份预采集数据，避免构建跨越日界线
  // 或构建期间新增访问时，两处展示出现不同的计数。
  if (process.env.BLOG_RELEASE_BUILD === 'true') {
    const state = readDataJson<{ stats?: SiteStatsSnapshot }>(path.join(dataDir(), 'release-state.json'), {});
    if (!state.stats) throw new Error('缺少发布统计快照');
    return state.stats;
  }
  const { since } = getSiteMeta();
  const stats = readDataJson<{ total?: number; days?: Record<string, number | { pv?: number; count?: number }> }>(
    path.join(dataDir(), 'stats.json'),
    { total: 0, days: {} },
  );
  const comments = readDataJson<unknown[]>(path.join(dataDir(), 'comments.json'), []);
  const live = readDataJson<{ items?: { isSpam?: boolean; pid?: string; _id: string }[] }>(path.join(dataDir(), 'comments-store.json'), {});
  const todayKey = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const today = stats.days?.[todayKey];
  return {
    since,
    comments: Array.isArray(live.items) ? live.items.filter(c => !c.isSpam).length : Array.isArray(comments) ? comments.length : 0,
    totalViews: Number(stats.total) || 0,
    todayViews: Number(typeof today === 'number' ? today : today?.pv ?? today?.count) || 0,
  };
}
