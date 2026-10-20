// 按实际可见内容启用边缘模糊：首尾已完整显示时，不覆盖正文或空白区域。
export function initProgressiveBlur(signal) {
  const roots = [...document.querySelectorAll('[data-progressive-viewport]')];
  if (!roots.length) return;
  let frame = 0;
  const sync = () => {
    frame = 0;
    for (const root of roots) {
      const viewport = root.firstElementChild;
      if (!viewport) continue;
      if (root.dataset.axis === 'vertical') {
        root.dataset.edgeStart = String(viewport.scrollTop > 2);
        root.dataset.edgeEnd = String(viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop > 2);
      } else {
        const box = viewport.getBoundingClientRect();
        const track = viewport.querySelector('[data-rail-track]');
        const bounds = [...(track ? [track] : viewport.children)].map((node) => node.getBoundingClientRect());
        root.dataset.edgeStart = String(bounds.some((rect) => rect.left < box.left - 2));
        root.dataset.edgeEnd = String(bounds.some((rect) => rect.right > box.right + 2));
      }
    }
  };
  const schedule = () => { if (!frame && !signal.aborted) frame = requestAnimationFrame(sync); };
  const observer = new ResizeObserver(schedule);
  for (const root of roots) {
    const viewport = root.firstElementChild;
    if (!viewport) continue;
    observer.observe(viewport);
    [...viewport.children].forEach((child) => observer.observe(child));
  }
  // 捕获内部滚动与窗口滚动；GSAP 横轨移动时也使用同一帧队列更新边缘状态。
  window.addEventListener('scroll', schedule, { signal, passive:true, capture:true });
  window.addEventListener('resize', schedule, { signal, passive:true });
  signal.addEventListener('abort', () => { cancelAnimationFrame(frame); observer.disconnect(); }, { once:true });
  sync();
}
