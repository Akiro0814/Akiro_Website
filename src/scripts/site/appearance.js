import gsap from 'gsap';
import { normalizeAppearance, styleForTime, styleForScroll } from '../../lib/appearance.js';

export function initAppearance(signal) {
  // 保存的是用户选择的风格与模式；时间/滚动模式算出的临时风格不覆盖手动选择。
  // 这样跨页、刷新和回到手动模式时，仍能恢复用户原先选中的外观。
  const root = document.documentElement;
  let { style, mode } = normalizeAppearance(root.dataset.style, root.dataset.styleMode);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let scrollFrame = 0;
  const store = () => { try { localStorage.setItem('akiro-appearance', JSON.stringify({ style, mode })); } catch {} };
  const sync = () => {
    let selected = style;
    if (mode === 'time') selected = styleForTime(new Date().getHours());
    if (mode === 'scroll') {
      const height = document.documentElement.scrollHeight - innerHeight;
      selected = styleForScroll(height > 0 ? scrollY / height : 0);
    }
    root.dataset.style = selected;
    root.dataset.styleMode = mode;
    document.querySelectorAll('[data-style-choice]').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.styleChoice === selected)));
    document.querySelectorAll('button[data-style-mode]').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.styleMode === mode)));
    const hint = document.querySelector('[data-style-hint]');
    if (hint) hint.textContent = mode === 'time' ? '随本地时间变化：清晨极简、白天生活、夜晚玻璃。' : mode === 'scroll' ? '随阅读位置变化：生活 → 极简 → 玻璃 → 粗野。' : '偏好保存在当前浏览器。';
  };
  document.querySelector('[data-style-reset]')?.addEventListener('click', () => {
    ({ style, mode } = normalizeAppearance(root.dataset.defaultStyle, root.dataset.defaultMode));
    try { localStorage.removeItem('akiro-appearance'); localStorage.removeItem('blog-theme'); } catch {}
    sync();
    window.dispatchEvent(new Event('akiro:theme-default'));
    window.dispatchEvent(new Event('akiro:appearance'));
  }, { signal });
  document.querySelectorAll('[data-style-choice]').forEach((el) => el.addEventListener('click', () => {
    style = normalizeAppearance(el.dataset.styleChoice, 'manual').style;
    mode = 'manual'; store(); sync(); window.dispatchEvent(new Event('akiro:appearance'));
  }, { signal }));
  document.querySelectorAll('button[data-style-mode]').forEach((el) => el.addEventListener('click', () => {
    mode = normalizeAppearance(style, el.dataset.styleMode).mode;
    store(); sync(); window.dispatchEvent(new Event('akiro:appearance'));
  }, { signal }));
  const onScroll = () => {
    if (mode !== 'scroll' || scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => { scrollFrame = 0; if (!signal.aborted) sync(); });
  };
  window.addEventListener('scroll', onScroll, { passive: true, signal });
  const timeInterval = setInterval(() => { if (mode === 'time') sync(); }, 60_000);
  signal.addEventListener('abort', () => { clearInterval(timeInterval); cancelAnimationFrame(scrollFrame); }, { once: true });
  sync();

  // 原生 dialog 负责模态焦点约束与 Escape。关闭后同步按钮状态并恢复触发点焦点；
  // Astro 换页中断当前页面时也主动关闭，防止旧遮罩或滚动锁留在新页面上。
  for (const [selector, id] of [['[data-menu-toggle]', 'site-menu'], ['[data-style-toggle]', 'style-console']]) {
    const trigger = document.querySelector(selector);
    const dialog = document.getElementById(id);
    if (!trigger || !(dialog instanceof HTMLDialogElement)) continue;
    let tween;
    const close = () => { tween?.kill(); dialog.close(); };
    trigger.addEventListener('click', () => {
      if (dialog.open) return close();
      dialog.showModal();
      trigger.setAttribute('aria-expanded', 'true');
      window.dispatchEvent(new CustomEvent('akiro:modal', { detail: true }));
      if (!reduced.matches) tween = gsap.fromTo(dialog, { opacity: 0, y: 15, scale: .96 }, { opacity: 1, y: 0, scale: 1, duration: .35, ease: 'power3.out', clearProps: 'all' });
    }, { signal });
    dialog.querySelector('[data-dialog-close]')?.addEventListener('click', close, { signal });
    dialog.addEventListener('click', (event) => {
      const rect = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) close();
    }, { signal });
    dialog.addEventListener('close', () => {
      tween?.kill(); trigger.setAttribute('aria-expanded', 'false');
      window.dispatchEvent(new CustomEvent('akiro:modal', { detail: false }));
      if (trigger.isConnected) trigger.focus({ preventScroll: true });
    }, { signal });
    signal.addEventListener('abort', () => { tween?.kill(); if (dialog.open) dialog.close(); }, { once: true });
  }
}
