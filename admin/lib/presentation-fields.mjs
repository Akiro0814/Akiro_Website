import { PRESENTATION_FIELDS, PUBLIC_NAV_ROUTES, normalizePresentation } from '../../src/lib/presentation.js';

const labels = { life: '生活', swiss: '瑞士', minimalist: '极简', glass: '玻璃', brutalist: '粗野', manual: '手动', time: '随时间', scroll: '随滚动', auto: '跟随系统', light: '浅色', dark: '深色', random: '本地目录随机壁纸', fixed: '固定图片或视频', gradient: '纯渐变背景' };
const routeLabels = ['首页', '文章', '项目', '随笔', '网址导航', '友链', '关于'];

// 后台表单从共享契约生成，键名和输入类型同时交给客户端采集；
// 避免增加前台字段后漏掉后台保存逻辑，以及 checkbox 未勾选时被误当缺失值。
export function renderPresentationFields(value, esc, { heroControls = {}, backgroundControls = '' } = {}) {
  const presentation = normalizePresentation(value);
  const locationLabels = { siteName:'站点名称 · 浏览器标题与搜索结果', author:'作者昵称 · 顶部导航与页脚', description:'站点描述 · 搜索摘要（不是首页个人简介）', avatar:'全站头像 · 导航、首页、关于页与页标', brandCaption:'顶部导航 · 昵称下方英文副标题', heroKicker:'大标题上方 · 英文小字', heroIdentity:'头像右侧第二段 · 身份说明', heroWords:'首屏大标题 · 打字轮换文字（每行一句）', heroAboutLabel:'首屏右侧按钮 · 关于作者', scrollLabel:'首屏底部 · 向下滚动提示' };
  const field = ([key, originalLabel, , , type]) => {
    const label=locationLabels[key] || originalLabel;
    const v = presentation[key];
    const attrs = `data-presentation-key="${esc(key)}" data-presentation-type="${Array.isArray(type) ? 'select' : type}"`;
    if (type === 'boolean') return `<label class="presentation-check"><input type="checkbox" ${attrs} ${v ? 'checked' : ''} /><span>${esc(label)}</span></label>`;
    let input;
    if (Array.isArray(type)) input = `<select class="input" ${attrs}>${type.map((option) => `<option value="${option}" ${v === option ? 'selected' : ''}>${labels[option] || option}</option>`).join('')}</select>`;
    else if (type === 'lines' || String(v).includes('\n') || /Body|Heading|Text|Title/.test(key)) input = `<textarea class="input" ${attrs} rows="${type === 'lines' ? 3 : 2}">${esc(Array.isArray(v) ? v.join('\n') : v)}</textarea>`;
    else input = `<input class="input" ${attrs} type="${type === 'number' ? 'number' : 'text'}" ${type === 'number' ? 'min="1" max="12"' : ''} value="${esc(v)}" ${['author', 'siteName', 'description'].includes(key) ? 'placeholder="留空沿用站点配置"' : ''} />`;
    return `<label class="field"><span class="field__label">${esc(label)}</span>${input}</label>`;
  };
  // 分区仅组织表单，不改变共享字段键名；隐藏分区也参与统一保存。
  const homeRegions = [
    ['hero', '01 · 首屏：头像、打字标题与按钮', '首页打开后看到的第一屏；两个小字分别位于头像旁和大标题上方。自定义轮换文字填写后，备用大标题不再生效。', ['heroIdentity','heroKicker','heroWords','heroAboutLabel','scrollLabel']],
    ['background', '02 · 首屏：背景图片或视频', '只在这里设置背景来源和固定地址；随机模式下，固定地址仅作为壁纸目录为空时的回退。', ['wallpaperMode']],
    ['writing', '03 · 文章区域：左侧说明与右侧文章', '首屏向下滚动后的第一段。标题和按钮在左侧，精选数量控制右侧文章卡片。', ['writingTitle','writingBody','writingLinkLabel','featuredLimit','showWriting']],
    ['status', '04 · 日常区域：状态与两个入口卡片', '文章区下方。先编辑左侧说明，再编辑右侧状态大卡、项目入口和网址入口。', ['statusTitle','statusBody','statusLinkLabel','statusHeading','statusWords','projectCardTitle','projectCardBody','bookmarkCardTitle','bookmarkCardBody','showStatus','showStats']],
    ['projects', '05 · 项目区域：左侧说明与右侧作品', '日常区下方。项目内容在项目管理中填写，这里只设置首页入口文字与展示数量。', ['projectsTitle','projectsBody','projectsLinkLabel','projectsLimit','showProjects']],
    ['quote', '06 · 首页底部：结语', '首页最后一句大字及其下方英文副标题，下面紧接全站页脚。', ['quoteText','quoteSignature','showQuote']],
  ];
  const homeMap = `<nav class="content-map" aria-label="首页位置示意">${homeRegions.map(([key,title])=>`<a href="#copy-${key}"><span>${title.split(' · ')[0]}</span><strong>${title.split(' · ')[1]}</strong></a>`).join('')}<p>这是位置示意，点击区块直达填写位置；不是额外的设置项。</p></nav>`;
  const wallpaperPanel = `<section class="card wallpaper-status-card"><div class="wallpaper-status-card__head"><div><h2 class="card__title">本地壁纸目录</h2><p>把图片放进 <code>public/wallpapers/</code>，后台可刷新预览；构建发布后加入前台随机壁纸池。</p></div><button type="button" class="btn btn--sm" data-wallpapers-refresh>刷新目录</button></div><p data-wallpapers-status role="status">正在读取目录…</p><div class="wallpaper-thumbs" data-wallpapers-list></div></section>`;
  const inputFor = (key) => field(PRESENTATION_FIELDS.find((item)=>item[0]===key));
  const heroFields = `<div class="presentation-fields">${heroControls.eyebrow||''}${inputFor('heroIdentity')}${inputFor('heroKicker')}${inputFor('heroWords')}${heroControls.title||''}${heroControls.bio||''}${heroControls.actionLabel||''}${heroControls.actionHref||''}${inputFor('heroAboutLabel')}${inputFor('scrollLabel')}</div><div class="content-legacy-fields">${heroControls.socials||''}</div>`;
  const group = (key, title, hint) => `<section class="card presentation-group" data-content-group="${key === 'home' ? 'home' : 'site'}">
    <div class="content-section-heading"><h2>${title}</h2><p>${hint}</p></div>
    ${key === 'home' ? homeMap + homeRegions.map(([id, label, hint, keys]) => `<fieldset class="content-region" id="copy-${id}" data-editor-region="${id}" tabindex="-1"><legend>${label}</legend><p class="content-location-hint">${hint}</p>${id === 'hero' ? heroFields : `<div class="presentation-fields">${PRESENTATION_FIELDS.filter((item) => keys.includes(item[0])).map(field).join('')}</div>${id === 'background' ? `<div class="content-legacy-fields">${backgroundControls}${wallpaperPanel}</div>` : ''}`}</fieldset>`).join('') : `<div class="presentation-fields">${PRESENTATION_FIELDS.filter((item) => item[2] === key && item[0] !== 'wallpaperMode').map(field).join('')}</div>`}
    ${key === 'brand' ? `<fieldset class="presentation-nav"><legend>顶部导航入口</legend>${PUBLIC_NAV_ROUTES.map((route, index) => `<label class="presentation-check"><input type="checkbox" data-presentation-nav="${route}" ${presentation.navItems.includes(route) ? 'checked' : ''} />${routeLabels[index]}</label>`).join('')}<p class="field__hint">这里控制顶部快捷链接；探索菜单保留全部可用页面。</p></fieldset>` : ''}</section>`;
  return `<div class="presentation-notice"><span class="presentation-notice__dot"></span><div><strong>设置与前台使用同一份数据</strong><p>文案、区块与默认外观：保存后构建发布。访客手动选择的外观优先于站点默认值。</p></div><a class="btn btn--sm" href="/admin/build">构建发布 ↗</a></div>
    ${group('brand', '品牌与导航', '站点名称 · 作者 · 头像 · 导航', true)}
    ${group('appearance', '全站默认外观', '五种风格 · 切换方式 · 明暗主题')}

    <section class="card" data-content-group="footer"><h2 class="card__title">页脚 · 主句</h2>${PRESENTATION_FIELDS.filter((item) => item[0] === 'footerQuote').map(field).join('')}</section>
    ${group('home', '首页 · 分区文案', '按前台从上到下排列，可分别编辑每个区域的文字和显示设置')}
    <section class="card presentation-preview" data-content-group="home" aria-label="首页文案预览"><span>填写结果预览（非设置项）· 实际布局以前台为准</span><strong data-profile-preview="author">${esc(presentation.author || 'Akiro')}</strong><p data-profile-preview="writingTitle">${esc(presentation.writingTitle)}</p><small data-profile-preview="quoteText">${esc(presentation.quoteText)}</small></section>`;
}
