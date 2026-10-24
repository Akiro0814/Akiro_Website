import { frameLoop, motionOff, tween } from './motion.js?v=20261024-notifications-1';

export function initLoginScene() {
  const canvas = document.getElementById('login-network');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const controller = new AbortController();
  const { signal } = controller;
  let width = 0,
    height = 0,
    burst = 0;
  const resize = () => {
    const r = canvas.getBoundingClientRect(),
      dpr = Math.min(devicePixelRatio || 1, 2);
    width = r.width;
    height = r.height;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  const points = Array.from({ length: 38 }, (_, i) => ({
    x: 0.12 + ((i * 37) % 79) / 100,
    y: 0.12 + ((i * 29) % 61) / 100,
    r: i % 7 === 0 ? 4 : 1.8,
  }));
  // 节点结构只分配一次，每帧只更新坐标，保留连线、流光与成功脉冲动画。
  const nodes = points.map((point) => ({ x: 0, y: 0, r: point.r }));
  const draw = (time) => {
    ctx.clearRect(0, 0, width, height);
    const off = motionOff(),
      t = off ? 0 : time;
    points.forEach((point, i) => {
      nodes[i].x = point.x * width + Math.sin(t * 0.17 + i) * 9;
      nodes[i].y = point.y * height + Math.cos(t * 0.15 + i) * 8;
    });
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i],
          b = nodes[j],
          distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (distance > width * 0.24) continue;
        ctx.strokeStyle = `rgba(236,181,160,${0.12 * (1 - distance / (width * 0.24))})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        if (!off && (i + j) % 5 === 0) {
          const u = (t * 0.12 + i * 0.1) % 1;
          ctx.fillStyle = 'rgba(244,199,180,.7)';
          ctx.beginPath();
          ctx.arc(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    for (const p of nodes) {
      ctx.fillStyle = 'rgba(240,201,183,.55)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (1 + Math.sin(t * 0.6) * 0.1), 0, Math.PI * 2);
      ctx.fill();
      if (p.r > 3) {
        ctx.strokeStyle = 'rgba(240,201,183,.12)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    const x = width * 0.53,
      y = height * 0.38,
      r = Math.min(width, height) * 0.1;
    const gradient = ctx.createRadialGradient(x - r * 0.4, y - r * 0.5, 0, x, y, r);
    gradient.addColorStop(0, '#fff9ef');
    gradient.addColorStop(0.4, '#eac5b5');
    gradient.addColorStop(0.8, '#ba8d7c');
    gradient.addColorStop(1, '#8e6759');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 60; i++) {
      const angle = (i / 60) * Math.PI * 2 + t * 0.025;
      const outer = r + 19,
        inner = outer - (i % 5 === 0 ? 7 : 3);
      ctx.strokeStyle = i < 30 ? 'rgba(241,210,191,.55)' : 'rgba(241,210,191,.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner);
      ctx.lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
      ctx.stroke();
    }
    if (burst > 0) {
      const elapsed = time - burst;
      for (let i = 0; i < 3; i++) {
        const radius = r + Math.max(0, elapsed - i * 0.12) * 200;
        ctx.strokeStyle = `rgba(250,219,197,${Math.max(0, 0.5 - elapsed * 0.4)})`;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (elapsed > 1.5) burst = 0;
    }
  };
  const loop = frameLoop(canvas, draw);
  const clock = document.getElementById('login-clock');
  const label = document.getElementById('login-date');
  const update = () => {
    if (document.hidden) return;
    const date = new Date();
    if (clock) clock.textContent = date.toLocaleTimeString('zh-CN', { hour12: false });
    if (label)
      label.textContent = date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
      });
  };
  update();
  const timer = setInterval(update, 1000);
  const card = document.querySelector('.login-card');
  if (card && matchMedia('(hover:hover)').matches) {
    card.addEventListener('pointermove', (e) => {
      if (motionOff()) return;
      const r = card.getBoundingClientRect();
      tween(card, {
        rotationY: ((e.clientX - r.left - r.width / 2) / r.width) * 8,
        rotationX: (-(e.clientY - r.top - r.height / 2) / r.height) * 6,
        duration: 0.5,
        ease: 'power3.out',
      });
    }, { signal });
    card.addEventListener('pointerleave', () =>
      tween(card, { rotationX: 0, rotationY: 0, duration: 0.6, ease: 'power3.out', clearProps: 'transform' }),
      { signal }
    );
  }
  document.addEventListener('blog:login-success', () => {
    burst = performance.now() / 1000;
  }, { signal });
  window.addEventListener(
    'pagehide',
    () => {
      loop.stop();
      observer.disconnect();
      clearInterval(timer);
      controller.abort();
      window.gsap?.killTweensOf(card);
    },
    { once: true }
  );
}
