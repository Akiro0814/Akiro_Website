import { PRESENTATION_FIELDS, PUBLIC_NAV_ROUTES, normalizePresentation } from '../../src/lib/presentation.js';

const labels = { life: '生活', swiss: '瑞士', minimalist: '极简', glass: '玻璃', brutalist: '粗野', manual: '手动', time: '随时间', scroll: '随滚动', auto: '跟随系统', light: '浅色', dark: '深色', random: '本地目录随机壁纸', fixed: '固定图片或视频', gradient: '纯渐变背景' };
const routeLabels = ['首页', '文章', '项目', '随笔', '网址导航', '友链', '关于'];

// 后台表单从共享契约生成，键名和输入类型同时交给客户端采集；
// 避免增加前台字段后漏掉后台保存逻辑，以及 checkbox 未勾选时被误当缺失值。
export function renderPresentationFields(value, esc) {
  const presentation = normalizePresentation(value);
  const field = ([key, label, , , type]) => {
    const v = presentation[key];
    const attrs = `data-presentation-key="${esc(key)}" data-presentation-type="${Array.isArray(type) ? 'select' : type}"`;
    if (type === 'boolean') return `<label class="presentation-check"><input type="checkbox" ${attrs} ${v ? 'checked' : ''} /><span>${esc(label)}</span></label>`;
    let input;
    if (Array.isArray(type)) input = `<select class="input" ${attrs}>${type.map((option) => `<option value="${option}" ${v === option ? 'selected' : ''}>${labels[option] || option}</option>`).join('')}</select>`;
    else if (type === 'lines' || String(v).includes('\n') || /Body|Heading|Text|Title/.test(key)) input = `<textarea class="input" ${attrs} rows="${type === 'lines' ? 3 : 2}">${esc(Array.isArray(v) ? v.join('\n') : v)}</textarea>`;
    else input = `<input class="input" ${attrs} type="${type === 'number' ? 'number' : 'text'}" ${type === 'number' ? 'min="1" max="12"' : ''} value="${esc(v)}" ${['author', 'siteName', 'description'].includes(key) ? 'placeholder="留空沿用站点配置"' : ''} />`;
    return `<label class="field"><span class="field__label">${esc(label)}</span>${input}</label>`;
  };
  const group = (key, title, hint, open = false) => `<details class="card presentation-group" ${open ? 'open' : ''}><summary><span>${title}</span><small>${hint}</small></summary><div class="presentation-fields">${PRESENTATION_FIELDS.filter((item) => item[2] === key).map(field).join('')}</div>${key === 'brand' ? `<fieldset class="presentation-nav"><legend>顶部导航入口</legend>${PUBLIC_NAV_ROUTES.map((route, index) => `<label class="presentation-check"><input type="checkbox" data-presentation-nav="${route}" ${presentation.navItems.includes(route) ? 'checked' : ''} />${routeLabels[index]}</label>`).join('')}<p class="field__hint">这里控制顶部快捷链接；探索菜单保留全部可用页面。</p></fieldset>` : ''}</details>`;
  return `<div class="presentation-notice"><span class="presentation-notice__dot"></span><div><strong>设置与前台使用同一份数据</strong><p>文案、区块与默认外观：保存后构建发布。访客手动选择的外观优先于站点默认值。</p></div><a class="btn btn--sm" href="/admin/build">构建发布 ↗</a></div>
    ${group('brand', '品牌与导航', '站点名称 · 作者 · 头像 · 导航', true)}
    ${group('appearance', '前台外观与背景', '五种风格 · 明暗主题 · 背景来源', true)}
    <section class="card wallpaper-status-card"><div class="wallpaper-status-card__head"><div><h2 class="card__title">本地壁纸目录</h2><p>把图片放进 <code>public/wallpapers/</code>，随机模式下自动发现，无需重新构建。</p></div><button type="button" class="btn btn--sm" data-wallpapers-refresh>刷新目录</button></div><p data-wallpapers-status role="status">正在读取目录…</p><div class="wallpaper-thumbs" data-wallpapers-list></div></section>
    ${group('home', '首页分区与轮换内容', '文案 · 推荐数量 · 显示开关')}
    <section class="card presentation-preview" aria-label="首页文案预览"><span>文案即时预览 · 实际布局以构建后的前台为准</span><strong data-profile-preview="author">${esc(presentation.author || 'Akiro')}</strong><p data-profile-preview="writingTitle">${esc(presentation.writingTitle)}</p><small data-profile-preview="quoteText">${esc(presentation.quoteText)}</small></section>`;
}
