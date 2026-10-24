// One motion vocabulary for the entire admin. GSAP is served locally.
const ease = { reveal: 'expo.out', glide: 'power4.out', settle: 'back.out(1.6)', exit: 'power2.in' };
export const motionOff = () => document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches;
const engine = () => window.gsap;
const visible = (elements) => [...elements].filter((el) => el.getClientRects().length);

export function tween(el, values) {
  if (!el) return;
  if (!engine() || motionOff()) {
    values.onComplete?.();
    return;
  }
  return engine().to(el, { overwrite: 'auto', ...values });
}

export function appear(el, kind = 'panel', origin) {
  if (!el || motionOff() || !engine()) return;
  engine().killTweensOf(el);
  if (kind === 'drawer' && origin?.isConnected) {
    const a = origin.getBoundingClientRect(),
      b = el.getBoundingClientRect();
    const ghost = document.createElement('div');
    ghost.className = 'pearl-ghost';
    Object.assign(ghost.style, {
      left: `${a.left}px`,
      top: `${a.top}px`,
      width: `${a.width}px`,
      height: `${a.height}px`,
    });
    document.body.append(ghost);
    engine().to(ghost, {
      left: b.left,
      top: b.top,
      width: b.width,
      height: b.height,
      duration: 0.44,
      ease: ease.glide,
      onComplete: () => ghost.remove(),
    });
    engine().fromTo(el, { opacity: 0 }, { opacity: 1, delay: 0.2, duration: 0.26, clearProps: 'opacity' });
  } else {
    if (origin?.isConnected && kind === 'panel') {
      const r = origin.getBoundingClientRect(),
        b = el.getBoundingClientRect();
      el.style.transformOrigin = `${Math.max(0, Math.min(b.width, r.left + r.width / 2 - b.left))}px ${Math.max(0, Math.min(b.height, r.top + r.height / 2 - b.top))}px`;
    }
    const from =
      kind === 'pop'
        ? { opacity: 0, y: -6, scale: 0.98 }
        : { opacity: 0, y: 14, scale: origin?.isConnected ? 0.86 : 0.96 };
    engine().fromTo(el, from, {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: kind === 'pop' ? 0.3 : 0.46,
      ease: ease.reveal,
      clearProps: 'opacity,transform,transformOrigin',
    });
  }
  const children = visible(
    el.querySelectorAll(':scope > .field, :scope > .pref-row, :scope > .pearl-answer, .drawer-body > *')
  );
  if (children.length)
    engine().fromTo(
      children,
      { opacity: 0, y: 8 },
      {
        opacity: 1,
        y: 0,
        duration: 0.42,
        stagger: 0.055,
        delay: 0.1,
        ease: ease.reveal,
        clearProps: 'opacity,transform',
      }
    );
}

export function dismiss(el, kind = 'panel', origin) {
  if (!el || motionOff() || !engine()) return Promise.resolve();
  // 打开尚未播完就关闭时，结束旧动画对同一属性的控制，防止回弹到展开态。
  engine().killTweensOf(el);
  return new Promise((resolve) => {
    if (kind === 'drawer' && origin?.isConnected) {
      const a = el.getBoundingClientRect(),
        b = origin.getBoundingClientRect();
      const ghost = document.createElement('div');
      ghost.className = 'pearl-ghost';
      Object.assign(ghost.style, {
        left: `${a.left}px`,
        top: `${a.top}px`,
        width: `${a.width}px`,
        height: `${a.height}px`,
      });
      document.body.append(ghost);
      engine().to(ghost, {
        left: b.left,
        top: b.top,
        width: b.width,
        height: b.height,
        opacity: 0,
        duration: 0.3,
        ease: ease.exit,
        onComplete: () => ghost.remove(),
      });
    }
    engine().to(el, {
      opacity: 0,
      y: kind === 'pop' ? -4 : 8,
      scale: 0.97,
      duration: 0.18,
      ease: ease.exit,
      onComplete: () => {
        engine().set(el, { clearProps: 'opacity,transform' });
        resolve();
      },
    });
  });
}

const placedThumbs = new WeakSet();
export function slideThumb(thumb, target, immediate = false) {
  if (!thumb || !target) return;
  const parent = thumb.offsetParent;
  if (!parent) return;
  let values;
  if (target.offsetParent === parent) {
    // 使用未经过 transform 的布局值：点击时按钮仍在按压回弹，不能将临时缩小的
    // getBoundingClientRect 固化为选中背景的最终尺寸；弹窗父级缩放亦不应改变坐标。
    values = { x:target.offsetLeft, y:target.offsetTop, width:target.offsetWidth, height:target.offsetHeight };
  } else {
    const a = parent.getBoundingClientRect(), b = target.getBoundingClientRect();
    const sx = parent.offsetWidth ? a.width / parent.offsetWidth : 1;
    const sy = parent.offsetHeight ? a.height / parent.offsetHeight : 1;
    values = {
      x:(b.left-a.left)/(sx||1)+parent.scrollLeft-parent.clientLeft,
      y:(b.top-a.top)/(sy||1)+parent.scrollTop-parent.clientTop,
      width:b.width/(sx||1), height:b.height/(sy||1),
    };
  }
  if (engine() && (immediate || !placedThumbs.has(thumb))) {
    engine().killTweensOf(thumb);
    engine().set(thumb, values);
  } else if (motionOff() || !engine()) {
    engine()?.killTweensOf(thumb);
    Object.assign(thumb.style, {
      transform: `translate(${values.x}px,${values.y}px)`,
      width: `${values.width}px`,
      height: `${values.height}px`,
    });
  } else engine().to(thumb, { ...values, duration: 0.52, ease: ease.glide, overwrite: true });
  placedThumbs.add(thumb);
}

const pageScenes = new Map();
const finishScene = (root) => {
  const scene = pageScenes.get(root);
  if (scene) { scene.progress(1); scene.kill(); pageScenes.delete(root); }
  if (root) root.dataset.motionScene = 'ready';
};

export function enterPage(root) {
  if (!root) return;
  finishScene(root);
  if (motionOff() || !engine()) return;
  // 一次有节奏的页面进场，不对父卡片和其中的统计数字重复叠加位移动画。
  // 页面内容先保持可用，再由 GSAP 接管；脚本缺失不会把服务端内容永久隐藏。
  root.dataset.motionScene = 'entering';
  const items = visible(root.querySelectorAll(':scope > *, #dash-root > *'));
  const timeline = engine().timeline({ onComplete: () => { pageScenes.delete(root); root.dataset.motionScene = 'ready'; } });
  pageScenes.set(root, timeline);
  timeline.fromTo(
    items,
    { opacity: 0, y: 12 },
    { opacity: 1, y: 0, duration: 0.68, stagger: 0.065, ease: ease.reveal, clearProps: 'opacity,transform' }
  );
  const cards = visible(root.querySelectorAll('.stat,.dash-stat,.media-item')).filter((card) => !items.includes(card));
  if (cards.length)
    engine().fromTo(
      cards,
      { opacity: 0, y: 18 },
      {
        opacity: 1,
        y: 0,
        duration: 0.7,
        stagger: { each: 0.035, from: 'center' },
        delay: 0.08,
        ease: ease.reveal,
        clearProps: 'opacity,transform',
      }
    );
}

export async function leavePage(root) {
  finishScene(root);
  if (!root || motionOff() || !engine()) return;
  await new Promise((resolve) =>
    engine().to(root, { opacity: 0, scale: 0.988, duration: 0.16, ease: ease.exit, onComplete: resolve })
  );
}

export function resetPage(root) {
  finishScene(root);
  if (engine() && root) engine().set(root, { clearProps: 'opacity,transform' });
}

export function animateNumber(el) {
  if (!el || el.dataset.odometer === el.textContent || motionOff() || !engine()) return;
  const raw = el.textContent.trim();
  if (!/^\d[\d,.]*$/.test(raw) || raw.length > 12) return;
  el.dataset.odometer = raw;
  el.setAttribute('aria-label', raw);
  el.textContent = '';
  for (const [index, digit] of [...raw].entries()) {
    if (!/\d/.test(digit)) {
      el.append(document.createTextNode(digit));
      continue;
    }
    const cell = document.createElement('span');
    cell.className = 'odometer-digit';
    cell.setAttribute('aria-hidden', 'true');
    const strip = document.createElement('span');
    strip.className = 'odometer-strip';
    for (let i = 0; i <= Number(digit) + 10; i++) {
      const row = document.createElement('span');
      row.textContent = String(i % 10);
      strip.append(row);
    }
    cell.append(strip);
    el.append(cell);
    engine().to(strip, {
      y: `-${(Number(digit) + 10) * 1.15}em`,
      duration: 0.9 + index * 0.045,
      ease: ease.reveal,
    });
  }
}

export function animateCharts(root, play = true) {
  if (!root) return;
  const animate = play && engine() && !motionOff();
  root.querySelectorAll('svg path.chart-line,svg .trend-line,svg path[data-draw]').forEach((path) => {
    if (!animate) return;
    try {
      const n = path.getTotalLength();
      engine().fromTo(
        path,
        { strokeDasharray: n, strokeDashoffset: n },
        {
          strokeDashoffset: 0,
          duration: 1.05,
          ease: ease.glide,
          clearProps: 'strokeDasharray,strokeDashoffset',
        }
      );
    } catch {
      /* Non-path chart elements keep their final state. */
    }
  });
  const bars = visible(root.querySelectorAll('.bar-row__fill,.rank-bar__fill,.gauge__fill'));
  if (animate && bars.length)
    engine().fromTo(
      bars,
      { scaleX: 0, transformOrigin: 'left' },
      { scaleX: 1, duration: 0.8, stagger: 0.025, ease: ease.reveal, clearProps: 'transform,transformOrigin' }
    );
  root.querySelectorAll('.gauge:not([data-tick-ring])').forEach((gauge) => {
    const value = parseFloat(gauge.querySelector('.gauge__head strong')?.textContent);
    if (!Number.isFinite(value)) return;
    gauge.dataset.tickRing = 'true';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 64 64');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('pearl-tick-ring');
    for (let i = 0; i < 40; i++) {
      const angle = (i / 40) * Math.PI * 2 - Math.PI / 2;
      const tick = document.createElementNS(svg.namespaceURI, 'line');
      tick.setAttribute('x1', String(32 + Math.cos(angle) * 23));
      tick.setAttribute('y1', String(32 + Math.sin(angle) * 23));
      tick.setAttribute('x2', String(32 + Math.cos(angle) * 28));
      tick.setAttribute('y2', String(32 + Math.sin(angle) * 28));
      tick.setAttribute('stroke', i / 40 < value / 100 ? 'var(--rose)' : 'var(--border)');
      tick.setAttribute('stroke-width', '2');
      tick.setAttribute('stroke-linecap', 'round');
      svg.append(tick);
    }
    gauge.prepend(svg);
    if (animate)
      engine().fromTo(
        svg.children,
        { opacity: 0 },
        { opacity: 1, duration: 0.4, stagger: 0.018, ease: 'power2.out' }
      );
  });
}

export function flipLayout(elements, mutate) {
  const flip = window.Flip;
  if (!flip || motionOff()) {
    mutate();
    return;
  }
  const state = flip.getState(elements);
  mutate();
  flip.from(state, { duration: 0.5, ease: ease.glide, absolute: false, stagger: 0.02 });
}

export function installMotion() {
  // 系统偏好切换时立刻显示最终画面，不让中途的透明度或位移滞留在界面上。
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (event) => {
    if (event.matches) [...pageScenes.keys()].forEach(finishScene);
  });
  const pressed = new Set();
  document.addEventListener(
    'pointerdown',
    (event) => {
      const el = event.target.closest(
        '.btn,.icon-button,.nav__item,.pearl-segment button,.command-row,.user-chip'
      );
      if (!el || el.disabled || event.button !== 0 || motionOff()) return;
      pressed.add(el);
      tween(el, { scale: 0.955, duration: 0.14, ease: 'power2.out' });
      if (el.matches('.btn--primary')) {
        const b = el.getBoundingClientRect(),
          s = Math.max(b.width, b.height) * 2;
        const ripple = document.createElement('span');
        ripple.className = 'pearl-ripple';
        Object.assign(ripple.style, {
          width: `${s}px`,
          height: `${s}px`,
          left: `${event.clientX - b.left - s / 2}px`,
          top: `${event.clientY - b.top - s / 2}px`,
        });
        el.append(ripple);
        engine()?.fromTo(
          ripple,
          { scale: 0, opacity: 0.22 },
          { scale: 1, opacity: 0, duration: 0.7, onComplete: () => ripple.remove() }
        );
      }
    },
    { passive: true }
  );
  const release = () => {
    pressed.forEach((el) =>
      tween(el, { scale: 1, duration: 0.46, ease: ease.settle, clearProps: 'transform' })
    );
    pressed.clear();
  };
  window.addEventListener('pointerup', release, { passive: true });
  window.addEventListener('pointercancel', release, { passive: true });
  if (matchMedia('(hover:hover)').matches) {
    let glowFrame = 0;
    document.addEventListener(
      'pointermove',
      (event) => {
        if (motionOff() || glowFrame) return;
        const el = event.target.closest('.stat,.pearl-board-card,.login-card,.main .card');
        if (!el) return;
        glowFrame = requestAnimationFrame(() => {
          glowFrame = 0;
          if (!el.isConnected) return;
          const r = el.getBoundingClientRect();
          el.classList.add('pearl-glow');
          el.style.setProperty('--px', `${event.clientX - r.left}px`);
          el.style.setProperty('--py', `${event.clientY - r.top}px`);
        });
      },
      { passive: true }
    );
    document.addEventListener('pointerover', (event) => {
      const el = event.target.closest('.pearl-board-card,.media-item,.quick-link');
      if (el && !el.contains(event.relatedTarget)) tween(el, { y: -3, duration: 0.34, ease: ease.glide });
    });
    document.addEventListener('pointerout', (event) => {
      const el = event.target.closest('.pearl-board-card,.media-item,.quick-link');
      if (el && !el.contains(event.relatedTarget))
        tween(el, { y: 0, duration: 0.42, ease: ease.settle, clearProps: 'transform' });
    });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden)
      engine()
        ?.globalTimeline.getChildren(false, true, true)
        .forEach((t) => t.progress(1, false));
  });
}

export function typeOut(element, text, signal) {
  element.textContent = text;
  if (motionOff() || signal?.aborted) return;
  let frame = 0;
  const started = performance.now();
  element.textContent = '';
  const step = (now) => {
    if (!element.isConnected || signal?.aborted) return;
    const count = motionOff() ? text.length : Math.min(text.length, Math.floor((now - started) / 18));
    element.textContent = text.slice(0, count);
    if (count < text.length) frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  signal?.addEventListener('abort', () => cancelAnimationFrame(frame), { once: true });
}

export function frameLoop(element, draw) {
  let id = 0,
    stopped = false,
    inView = true,
    paused = false;
  const observer = new IntersectionObserver((entries) => {
    inView = entries[0].isIntersecting;
    restart();
  });
  const frame = (time) => {
    id = 0;
    if (stopped || paused || document.hidden || !inView) return;
    try {
      draw(time / 1000);
    } catch {
      stopped = true;
      return;
    }
    if (!motionOff()) id = requestAnimationFrame(frame);
  };
  const restart = () => {
    if (!id && !stopped && !paused && !document.hidden && inView) id = requestAnimationFrame(frame);
  };
  observer.observe(element);
  document.addEventListener('visibilitychange', restart);
  restart();
  const query = matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', restart);
  return {
    pause(value) {
      paused = value;
      restart();
    },
    replay: restart,
    stop() {
      stopped = true;
      cancelAnimationFrame(id);
      observer.disconnect();
      document.removeEventListener('visibilitychange', restart);
      query.removeEventListener('change', restart);
    },
  };
}
