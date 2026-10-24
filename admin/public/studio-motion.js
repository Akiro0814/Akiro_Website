import { motionOff, tween } from './motion.js?v=20261024-notifications-1';

// 页面级互动均持有当前页面 signal：切页后不再观察旧表格、改写旧状态或累积监听。
export function enhanceStudio(root, signal) {
  const state = document.getElementById('studio-save-state');
  let savedTimer;
  const setState = (text, kind = '') => {
    if (!state) return;
    state.textContent = text;
    state.className = `studio-save-state ${kind}`;
  };
  setState('准备就绪');
  const dirty = (event) => {
    if (!root.querySelector('#profile-save') || !event.target.matches('input,textarea,select')) return;
    clearTimeout(savedTimer);
    root.dataset.profileDirty = 'true';
    setState('有未保存修改', 'is-dirty');
  };
  root.addEventListener('input', dirty, { signal });
  root.addEventListener('change', dirty, { signal });
  document.addEventListener('blog:saved', () => {
    root.dataset.profileDirty = 'false';
    setState('已保存到后台', 'is-saved');
    root.classList.remove('studio-saved');
    requestAnimationFrame(() => { if (!signal.aborted) root.classList.add('studio-saved'); });
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => { if (!signal.aborted) setState('准备就绪'); }, 4500);
  }, { signal });
  const revealed = new WeakSet();
  const revealRows = (rows) => {
    const fresh = rows.filter((row) => !revealed.has(row) && row.getClientRects().length);
    rows.forEach((row) => revealed.add(row));
    if (!fresh.length || !window.gsap || motionOff()) return;
    // 仅对新加入的行交错进场，不重播用户正在操作的表单或既有行。
    window.gsap.fromTo(fresh.slice(0, 16), { opacity: 0, x: 10 }, { opacity: 1, x: 0, duration: .4, stagger: .025, ease: 'power3.out', clearProps: 'opacity,transform' });
  };
  root.querySelectorAll('tbody>tr').forEach((row) => revealed.add(row));
  const observer = new MutationObserver((records) => {
    const rows = [];
    records.forEach((record) => record.addedNodes.forEach((node) => {
      if (!(node instanceof Element)) return;
      if (node.matches('tr')) rows.push(node);
      rows.push(...node.querySelectorAll('tbody>tr'));
    }));
    revealRows(rows);
  });
  observer.observe(root, { childList: true, subtree: true });
  root.addEventListener('toggle', (event) => {
    const details = event.target;
    if (!details.matches?.('.presentation-group') || !details.open || motionOff()) return;
    tween(details.querySelector('.presentation-fields'), { opacity: 1, y: 0, startAt: { opacity: .3, y: 9 }, duration: .35, clearProps: 'opacity,transform' });
  }, { signal, capture: true });
  signal.addEventListener('abort', () => {
    observer.disconnect(); clearTimeout(savedTimer);
    window.gsap?.killTweensOf(root.querySelectorAll('tbody>tr,.presentation-fields'));
  }, { once: true });
}
