import { normalizeMediaUrl } from './media-url.js';

// 一份配置契约同时用于后台表单、写入校验与前台构建；新增页面字段必须从这里定义，
// 防止后台显示“已保存”但前台仍读取另一套写死的值。
export const PRESENTATION_FIELDS = [
  ['siteName', '站点名称', 'brand', '', 'text'],
  ['author', '作者昵称', 'brand', '', 'text'],
  ['description', '站点描述', 'brand', '', 'text'],
  ['avatar', '头像与网站页标', 'brand', '/avatars/avatar.jpg', 'media'],
  ['brandCaption', '导航副标题', 'brand', 'PERSONAL JOURNAL', 'text'],
  ['heroKicker', '首屏英文眉标', 'home', 'THE LITTLE THINGS, KEPT.', 'text'],
  ['heroIdentity', '首屏身份说明', 'home', '个人博客 / 灵感与日常', 'text'],
  ['heroWords', '打字轮换文字（每行一条，留空自动使用昵称与主标题）', 'home', [], 'lines'],
  ['heroAboutLabel', '首屏关于按钮文字', 'home', '此间主人', 'text'],
  ['scrollLabel', '向下滚动提示', 'home', '慢慢往下看', 'text'],
  ['writingTitle', '文章区标题', 'home', '写下来的，\n都是片刻。', 'text'],
  ['writingBody', '文章区说明', 'home', '一些实践，一些想法。把走过的路和遇到的问题，慢慢写成自己的答案。', 'text'],
  ['writingLinkLabel', '文章区按钮文字', 'home', '全部文章', 'text'],
  ['statusTitle', '状态区标题', 'home', '此时，\n还在生长。', 'text'],
  ['statusBody', '状态区说明', 'home', '让写作和创造成为日常。这是这个小站留下的足迹，也是下一次出发的起点。', 'text'],
  ['statusLinkLabel', '状态区按钮文字', 'home', '看看日常', 'text'],
  ['projectCardTitle', '项目入口标题', 'home', '想法，正在运行', 'text'],
  ['projectCardBody', '项目入口说明', 'home', '工具、应用与小实验', 'text'],
  ['bookmarkCardTitle', '收藏入口标题', 'home', '值得收藏的角落', 'text'],
  ['bookmarkCardBody', '收藏入口说明', 'home', '让好用的东西，有处可寻', 'text'],
  ['statusHeading', '状态卡片主句', 'home', '把普通的日子，\n过成自己的', 'text'],
  ['statusWords', '状态卡片轮换文字（每行一条）', 'home', ['小小实验。', '灵感花园。', '独家记忆。'], 'lines'],
  ['projectsTitle', '项目区标题', 'home', '让灵感，\n有迹可循。', 'text'],
  ['projectsBody', '项目区说明', 'home', '从一个念头到一个可以运行的作品。探索还没结束，欢迎来看看。', 'text'],
  ['projectsLinkLabel', '项目区按钮文字', 'home', '所有项目', 'text'],
  ['quoteText', '首页结语', 'home', '好奇心不必急着抵达，\n记录本身，就是一种答案。', 'text'],
  ['quoteSignature', '结语副标题', 'home', 'KEEP EXPLORING · KEEP CREATING', 'text'],
  ['footerQuote', '页脚主句', 'home', '把好奇心留给世界，把日常留在这里。', 'text'],
  ['featuredLimit', '首页精选文章数量（1–12）', 'home', 6, 'number'],
  ['projectsLimit', '首页项目数量（1–12）', 'home', 6, 'number'],
  ['showWriting', '显示文章区', 'home', true, 'boolean'],
  ['showStatus', '显示状态区', 'home', true, 'boolean'],
  ['showStats', '显示网站统计', 'home', true, 'boolean'],
  ['showProjects', '显示项目区', 'home', true, 'boolean'],
  ['showQuote', '显示首页结语', 'home', true, 'boolean'],
  ['defaultStyle', '新访客默认风格', 'appearance', 'life', ['life', 'swiss', 'minimalist', 'glass', 'brutalist']],
  ['defaultMode', '新访客风格切换方式', 'appearance', 'manual', ['manual', 'time', 'scroll']],
  ['defaultTheme', '新访客明暗主题', 'appearance', 'auto', ['auto', 'light', 'dark']],
  ['wallpaperMode', '首页背景来源', 'appearance', 'random', ['random', 'fixed', 'gradient']],
];
export const PUBLIC_NAV_ROUTES = ['/', '/archive/', '/projects/', '/notes/', '/nav/', '/friends/', '/about/'];
export const DEFAULT_PRESENTATION = Object.fromEntries(PRESENTATION_FIELDS.map(([key, , , value]) => [key, value]));
DEFAULT_PRESENTATION.navItems = ['/', '/archive/', '/projects/', '/notes/', '/about/'];

/** @returns {Record<string, any>} */
export function normalizePresentation(input = {}, current = DEFAULT_PRESENTATION) {
  const base = { ...DEFAULT_PRESENTATION, ...current };
  const out = {};
  for (const [key, , , , type] of PRESENTATION_FIELDS) {
    const value = input?.[key] ?? base[key];
    if (Array.isArray(type)) out[key] = type.includes(value) ? value : base[key];
    else if (type === 'boolean') out[key] = typeof value === 'boolean' ? value : base[key];
    else if (type === 'number') out[key] = Number.isFinite(Number(value)) ? Math.max(1, Math.min(12, Math.trunc(Number(value)))) : base[key];
    else if (type === 'lines') out[key] = (Array.isArray(value) ? value : String(value).split('\n')).map((line) => String(line).trim().slice(0, 100)).filter(Boolean).slice(0, 8);
    else if (type === 'media') out[key] = normalizeMediaUrl(value) || base[key];
    else out[key] = String(value).trim().slice(0, key.endsWith('Body') || key === 'description' ? 600 : 200);
  }
  // 空导航列表是有意隐藏顶部链接，不能与没有设置混为一谈。
  out.navItems = [...new Set((Array.isArray(input?.navItems) ? input.navItems : base.navItems).filter((href) => PUBLIC_NAV_ROUTES.includes(href)))];
  return out;
}
