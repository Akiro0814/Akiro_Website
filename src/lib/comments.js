// 使用官方 Twikoo SDK，沿用博客的按需挂载与划词引用入口。
// CSS 由 BaseLayout 打包，避免 Astro 换页移除 SDK 动态 style 后丢失样式。
import { TWIKOO_VERSION } from './twikoo-version.js';

export const commentsBackendId = () => '/api/public/twikoo';
export const commentsAvailable = () => true;
let scriptPromise;
let mountQueue = Promise.resolve();
let sequence = 0;
const loadSdk = () => scriptPromise ??= new Promise((resolve, reject) => {
  if (window.twikoo) return resolve(window.twikoo);
  const script = document.createElement('script');
  script.src = `/vendor/twikoo-${TWIKOO_VERSION}.js`;
  script.async = true;
  script.onload = () => resolve(window.twikoo);
  script.onerror = () => { scriptPromise = null; script.remove(); reject(Error('评论组件加载失败，请刷新重试。')); };
  document.head.append(script);
});

/** @param {HTMLElement} root @param {{envId?: string, url?: string, onCount?: (count: number) => void}} [options] */
export function mountComments(root, { envId = commentsBackendId(), url, onCount } = {}) {
  root.id = `twikoo-client-${++sequence}`;
  root.innerHTML = '<p class="comment-service-status" role="status">正在加载 Twikoo 评论…</p>';
  let disposed = false;
  let pendingReturnY = null;
  let quoteSubmitted = false;
  const controller = new AbortController();
  const markSubmit = () => { if (pendingReturnY !== null) quoteSubmitted = true; };
  root.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('.tk-submit .tk-button--primary')) markSubmit();
  }, { signal: controller.signal });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) markSubmit();
  }, { signal: controller.signal });
  // 官方 SDK 同一窗口内只有一个实例；串行挂载，防止快速跨页的异步初始化抢占新页面。
  const ready = mountQueue.catch(() => {}).then(async () => {
    const twikoo = await loadSdk();
    if (disposed || !root.isConnected) return;
    await twikoo.init({
      envId: new URL(envId, location.origin).href, el: `#${root.id}`, path: url || location.pathname, lang: 'zh-CN',
      onCommentLoaded() {
        if (disposed || !root.isConnected) return;
        const count = root.querySelector('.tk-comments-count')?.textContent?.match(/\d+/);
        if (onCount && count) onCount(Number(count[0]));
        if (quoteSubmitted && pendingReturnY !== null && root.querySelector('textarea')?.value === '') {
          const y = pendingReturnY; pendingReturnY = null;
          quoteSubmitted = false;
          window.scrollTo({ top: y, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
        }
      },
    });
    if (disposed || !root.isConnected) root.__vue_app__?.unmount();
  }).catch((error) => {
    if (disposed || !root.isConnected) return;
    const message = document.createElement('p');
    message.className = 'comment-service-status is-error'; message.setAttribute('role', 'alert');
    message.textContent = `${error?.message || '评论服务暂不可用'}，请稍后刷新重试。`;
    root.append(message);
  });
  mountQueue = ready;
  return {
    ready,
    async quote({ text = '', returnY = NaN } = {}) {
      await ready;
      if (disposed) return;
      const textarea = root.querySelector('textarea');
      if (!textarea) return;
      const quote = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 360);
      if (!quote) return;
      pendingReturnY = Number.isFinite(returnY) ? returnY : null;
      quoteSubmitted = false;
      textarea.value = `${textarea.value ? `${textarea.value.trimEnd()}\n\n` : ''}> ${quote}\n\n`;
      // Vue v-model 需要真实 input 事件，不能只改 DOM value。
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    },
    dispose() {
      disposed = true;
      controller.abort();
      root.__vue_app__?.unmount();
    },
  };
}
