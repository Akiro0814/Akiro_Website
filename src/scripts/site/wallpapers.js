import { normalizeMediaUrl } from '../../lib/media-url.js';

// 即使列表来自运行时 API，也只允许壁纸目录内的单层图片 URL。
const isWallpaper = (url) => {
  if (typeof url !== 'string' || !url.startsWith('/wallpapers/')) return false;
  try {
    const name = decodeURIComponent(url.slice('/wallpapers/'.length));
    return !!name && !name.startsWith('.') && !/[\\/]/.test(name)
      && ![...name].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
      && /\.(?:jpe?g|png|webp|avif|gif)$/i.test(name);
  } catch { return false; }
};

export function chooseWallpaper(items, previous = '', random = Math.random) {
  const valid = [...new Set(Array.isArray(items) ? items.filter(isWallpaper) : [])];
  const pool = valid.length > 1 ? valid.filter((url) => url !== previous) : valid;
  return pool[Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)))] || '';
}

export function initWallpapers(signal) {
  const host = document.querySelector('[data-wallpaper-host]');
  if (!host || host.dataset.wallpaperReady === '1') return;
  host.dataset.wallpaperReady = '1';
  const mode = host.dataset.wallpaperMode || 'random';
  let previous = '';
  try { previous = sessionStorage.getItem('akiro:last-wallpaper') || ''; } catch { /* 隐私模式仍可随机 */ }
  const fallback = normalizeMediaUrl(host.dataset.wallpaperFallback);
  let staticItems = [];
  let selected = '';
  let detachError = () => {};
  try { staticItems = JSON.parse(host.dataset.wallpaperList || '[]'); } catch { /* 空清单回退 */ }

  const show = (url, mayFallback = true) => {
    if (signal.aborted || !host.isConnected) return;
    detachError();
    let media = host.querySelector('[data-hero-media]');
    if (!url) { media?.remove(); return; }
    const video = /\.(mp4|webm|ogg|mov|m4v)(?:$|\?)/i.test(url);
    if (!media || media.tagName !== (video ? 'VIDEO' : 'IMG')) {
      const next = document.createElement(video ? 'video' : 'img');
      next.setAttribute('data-hero-media', '');
      if (video) {
        next.autoplay = true; next.loop = true; next.muted = true; next.playsInline = true; next.preload = 'metadata';
      } else {
        next.alt = ''; next.decoding = 'async'; next.fetchPriority = 'high'; next.referrerPolicy = 'no-referrer';
      }
      media?.remove();
      host.prepend(next);
      media = next;
    }
    // 等当前错误事件结束后再绑定下一份媒体的监听，避免一次失败事件被新监听
    // 重复处理并跳过本来可以成功加载的回退图片。
    const onError = () => queueMicrotask(() => show(mayFallback && fallback !== url ? fallback : '', false));
    // 动效模块可能曾隐藏失败媒体；切换来源和真正加载成功时都恢复可见。
    const onReady = () => { media.hidden = false; };
    const readyEvent = video ? 'loadeddata' : 'load';
    media.addEventListener('error', onError, { once: true, signal });
    media.addEventListener(readyEvent, onReady, { once: true, signal });
    const boundMedia = media;
    detachError = () => {
      boundMedia.removeEventListener('error', onError);
      boundMedia.removeEventListener(readyEvent, onReady);
    };
    media.hidden = false;
    media.setAttribute('src', url);
    if (video) {
      const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
      const sync = () => { if (query?.matches) boundMedia.pause(); else boundMedia.play().catch(() => {}); };
      sync();
      query?.addEventListener('change', sync, { signal });
      signal.addEventListener('abort', () => boundMedia.pause(), { once: true });
    }
  };
  const select = (items, runtime = false) => {
    if (signal.aborted) return;
    const chosen = chooseWallpaper(items, previous);
    selected = chosen;
    show(chosen ? (runtime ? `/api/public${chosen}` : chosen) : fallback);
    if (chosen) {
      previous = chosen;
      try { sessionStorage.setItem('akiro:last-wallpaper', chosen); } catch { /* 不依赖持久化 */ }
    }
  };

  // 后台指定固定图片或渐变时，不让随机目录覆盖明确选择的背景。
  if (mode === 'gradient') { show(''); return; }
  if (mode === 'fixed') { show(fallback); return; }
  // 立即使用静态清单，后端可用时再以实时目录校正；避免只有构建时随机。
  select(staticItems);
  const gate = window.__blogApi?.gateFetch;
  const request = gate
    ? gate('/api/public/wallpapers', { cache: 'no-store', signal })
    : fetch('/api/public/wallpapers', { cache: 'no-store', signal });
  Promise.resolve(request).then(async (response) => {
    if (!response?.ok) return;
    const data = await response.json();
    if (!Array.isArray(data.items)) return;
    const next = data.items.filter(isWallpaper).sort();
    const current = (Array.isArray(staticItems) ? staticItems.filter(isWallpaper) : []).sort();
    // 清单未变时不二次换图，避免一个页面出现两次随机切换。
    if (JSON.stringify(next) !== JSON.stringify(current)) select(next, true);
    else if (selected) show(`/api/public${selected}`);
  }).catch(() => { /* 静态托管或断网时保留构建清单，不打断首页 */ });
}
