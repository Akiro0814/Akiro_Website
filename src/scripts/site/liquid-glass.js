import { createGlassMap, glassSpring } from '../../lib/liquid-glass.js';

export function initLiquidGlass(signal) {
  const nav = document.querySelector('[data-site-header]');
  const filter = document.getElementById('akiro-nav-refraction');
  const image = filter?.querySelector('feImage');
  const surface = nav?.querySelector('.atlas-nav__glass');
  if (!nav || !filter || !image || !surface) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const opaque = matchMedia('(prefers-reduced-transparency: reduce)');
  const fine = matchMedia('(hover:hover) and (pointer:fine)');
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const supported = context && CSS.supports('backdrop-filter', 'url("#akiro-nav-refraction") blur(1px)');
  let frame = 0, lightFrame = 0, animation, signature = '';
  let light = { x: 50, y: 0 };
  const release = () => {
    const pressed = nav.classList.contains('is-glass-pressed');
    nav.classList.remove('is-glass-pressed');
    animation?.cancel();
    if (!pressed || reduced.matches || opaque.matches || signal.aborted) return;
    // 只形变背景层，导航本体与命中区域固定，没有惯性拖动或页面级指针捕获。
    animation = surface.animate(Array.from({ length: 26 }, (_, i) => {
      const t = i / 25, remaining = i === 25 ? 0 : 1 - glassSpring(t);
      return { transform: `scale(${1 + .006 * remaining},${1 - .035 * remaining})`, offset: t };
    }), { duration: 500, easing: 'linear' });
  };
  const resetLight = () => {
    cancelAnimationFrame(lightFrame); lightFrame = 0;
    nav.style.removeProperty('--nav-light-opacity');
    release();
  };
  const update = () => {
    frame = 0;
    if (signal.aborted) return;
    resetLight();
    if (!supported || opaque.matches) { nav.dataset.liquidReady = 'false'; return; }
    const width = nav.clientWidth, height = nav.clientHeight;
    const radius = parseFloat(getComputedStyle(nav).borderTopLeftRadius) || 0;
    const next = `${width}/${height}/${radius}`;
    if (next !== signature) {
      try {
        const map = createGlassMap(width, height, { radius });
        canvas.width = map.width; canvas.height = map.height;
        context.putImageData(new ImageData(map.data, map.width, map.height), 0, 0);
        for (const el of [filter, image]) {
          el.setAttribute('width', String(width)); el.setAttribute('height', String(height));
        }
        image.setAttribute('href', canvas.toDataURL());
        filter.querySelectorAll('feDisplacementMap').forEach((el) => {
          el.setAttribute('scale', String(map.scale * Number(el.getAttribute('data-dispersion'))));
        });
        signature = next;
      } catch {
        // Canvas 被隐私策略禁用时保留毛玻璃，不让材质失败影响导航。
        nav.dataset.liquidReady = 'false'; return;
      }
    }
    nav.dataset.liquidReady = 'true';
  };
  const schedule = () => { if (!frame && !signal.aborted) frame = requestAnimationFrame(update); };
  const resize = new ResizeObserver(schedule);
  resize.observe(nav);
  // 五种风格会改变圆角；明暗主题由 CSS 色板直接更新，无需重算像素。
  const appearance = new MutationObserver(schedule);
  appearance.observe(document.documentElement, { attributes: true, attributeFilter: ['data-style'] });
  opaque.addEventListener('change', schedule, { signal });
  reduced.addEventListener('change', resetLight, { signal });
  fine.addEventListener('change', resetLight, { signal });
  nav.addEventListener('pointermove', (event) => {
    if (reduced.matches || opaque.matches || !fine.matches || nav.dataset.liquidReady !== 'true') return;
    const rect = nav.getBoundingClientRect();
    light = { x: (event.clientX - rect.left) / rect.width * 100, y: (event.clientY - rect.top) / rect.height * 100 };
    if (!lightFrame) lightFrame = requestAnimationFrame(() => {
      lightFrame = 0;
      nav.style.setProperty('--nav-light-x', `${light.x.toFixed(2)}%`);
      nav.style.setProperty('--nav-light-y', `${light.y.toFixed(2)}%`);
      nav.style.setProperty('--nav-light-opacity', '.65');
    });
  }, { signal, passive: true });
  nav.addEventListener('pointerleave', resetLight, { signal });
  nav.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || reduced.matches || opaque.matches || nav.dataset.liquidReady !== 'true') return;
    animation?.cancel();
    nav.classList.add('is-glass-pressed');
  }, { signal, passive: true });
  window.addEventListener('pointerup', release, { signal });
  window.addEventListener('pointercancel', resetLight, { signal });
  window.addEventListener('blur', resetLight, { signal });
  signal.addEventListener('abort', () => {
    cancelAnimationFrame(frame); cancelAnimationFrame(lightFrame);
    resize.disconnect(); appearance.disconnect(); animation?.cancel();
    nav.classList.remove('is-glass-pressed');
  }, { once: true });
  update();
}
