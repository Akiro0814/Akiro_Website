// 站点外壳脚本装配：主题切换、显现动画、复制代码、灯箱、阅读进度、目录高亮、
// 访问打点、快捷键与 service worker 清理。
//
// 生命周期：打包成单个可缓存模块（不再随每页 HTML 下发），只执行一次；
// 每次 ClientRouter 换页在 astro:after-swap（新帧捕获前）用新的
// AbortController 重新绑定页面元素级监听，与原内联 data-astro-rerun 脚本
// 的时机等价。主题初始化等必须阻塞首帧的极小片段仍在 <head> 内联。
import { initMotion } from './motion.js';
import { initLiquidGlass } from './liquid-glass.js';
import { initProgressiveBlur } from './progressive-blur.js';
import { initProjects } from './projects.js';
import { initAppearance } from './appearance.js';
import { initWallpapers } from './wallpapers.js';
import { initImgFade } from './img-fade.js';
import { initThemeToggle } from './theme-toggle.js';
import { initCopyCode } from './copy-code.js';
import { initHeadingAnchors } from './anchors.js';
import { initLightbox } from './lightbox.js';
import { initProgress } from './progress.js';
import { initToc } from './toc.js';
import { initShortcuts } from './shortcuts.js';
import { initSwCleanup } from './sw-cleanup.js';
import { trackView } from './tracking.js';

let controller = null;
let activeDocument;
let navigationNode;
let navigationController;

const initPage = () => {
  // after-swap 在新页面快照前准备动效，避免 page-load 才把已出现的标题
  // 再次隐藏。page-load 仍负责首次直达；同一个 body 只初始化一次。
  if (activeDocument === document.body) return;
  activeDocument = document.body;
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;

  initThemeToggle(signal);
  initCopyCode(signal);
  initHeadingAnchors(signal);
  initLightbox(signal);
  initProgress(signal);
  initToc(signal);
  initAppearance(signal);
  initWallpapers(signal);
  // 导航及 SVG 定义跨路由持久化；材质层的控制器不随正文重建，避免每次换页
  // 都销毁 GPU 滤镜、按钮光照和 ResizeObserver。页面级按钮监听仍按页重新绑定。
  const nav=document.querySelector('[data-site-header]');
  if(nav!==navigationNode) {
    navigationController?.abort();navigationController=new AbortController();navigationNode=nav;
    initLiquidGlass(navigationController.signal);
  }
  nav?.querySelectorAll('.atlas-nav__links a').forEach((link)=>{
    const href=link.getAttribute('href');
    const active=href==='/'?location.pathname==='/':location.pathname.startsWith(href);
    if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  });
  initMotion(signal);
  initProgressiveBlur(signal);
  initProjects(signal);
  initImgFade(signal);
  trackView();
};

// 首次加载立即初始化；文档级行为只绑定一次。
// Astro emits page-load after deferred modules on both first entry and every swap.
initShortcuts();
initSwCleanup();

document.addEventListener('astro:before-swap', () => controller?.abort());
document.addEventListener('astro:after-swap', initPage);
document.addEventListener('astro:page-load', initPage);
