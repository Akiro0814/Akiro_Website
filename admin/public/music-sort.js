// 实际行留在文档流中充当占位，独立浮层负责跟手，表格列宽不会在拖动中变化。
// 排序只改 DOM，持久化仍交给现有“保存顺序”按钮和接口。
export function initMusicSort(table, { select, changed, dragging, signal }) {
  const rows = () => [...table.querySelectorAll('[data-track-row]')];
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let active = false;
  let cancelDrag = () => {};
  signal?.addEventListener('abort', () => cancelDrag(), { once: true });
  const rearrange = (mutation) => {
    const items = rows();
    // 先记住屏幕上的动画中间位置，再撤销旧动画并读取新布局，连续换位也不会跳帧。
    const before = items.map((el) => el.getBoundingClientRect().top);
    items.forEach((el) => el.getAnimations().forEach((animation) => animation.cancel()));
    mutation();
    if (reduced()) return;
    items.forEach((el, i) => {
      const dy = before[i] - el.getBoundingClientRect().top;
      if (dy) el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], { duration: 210, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
  };
  table.addEventListener('keydown', (event) => {
    const handle = event.target.closest('[data-track-drag]');
    if (!handle || active || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const row = handle.closest('[data-track-row]');
    select(row);
    const next = event.key === 'ArrowUp' ? row.previousElementSibling : row.nextElementSibling;
    if (!next?.hasAttribute('data-track-row')) return;
    rearrange(() => event.key === 'ArrowUp' ? next.before(row) : next.after(row));
    handle.focus({ preventScroll: true });
    row.scrollIntoView({ block: 'nearest' });
    changed();
  }, { signal });
  table.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest('[data-track-drag]');
    if (!handle || event.button !== 0 || event.isPrimary === false || active) return;
    event.preventDefault();
    const row = handle.closest('[data-track-row]');
    select(row);
    handle.focus({ preventScroll: true });
    const initial = rows();
    const rect = row.getBoundingClientRect();
    const offsetY = event.clientY - rect.top;
    const initialX = event.clientX;
    const initialY = event.clientY;
    const scope = new AbortController();
    const options = { signal: scope.signal };
    let ghost = null;
    let pointerY = initialY;
    let frame = 0;
    const update = () => {
      if (!ghost) return;
      ghost.style.transform = `translateY(${pointerY - offsetY}px) scale(1.012)`;
      const siblings = rows().filter((el) => el !== row);
      const next = siblings.find((el) => {
        // 从屏幕位置剥离 FLIP 位移，避免鼠标静止时反复换位。
        const box = el.getBoundingClientRect();
        const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform);
        return pointerY < box.top - matrix.m42 + box.height / 2;
      });
      if (next === row.nextElementSibling || (!next && !row.nextElementSibling)) return;
      rearrange(() => next ? next.before(row) : row.parentElement.append(row));
    };
    let previousTime = 0;
    const tick = (now) => {
      const dt = Math.min(32, previousTime ? now - previousTime : 16);
      previousTime = now;
      const edge = 90;
      const speed = pointerY < edge ? -Math.min(1, (edge - pointerY) / edge) : pointerY > innerHeight - edge ? Math.min(1, (pointerY - innerHeight + edge) / edge) : 0;
      // 指针停在边缘时仍滚动，不要求持续触发 pointermove。
      if (speed) window.scrollBy(0, speed * dt * .65);
      update();
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      active = true;
      dragging(true);
      ghost = document.createElement('table');
      ghost.className = 'table music-drag-ghost';
      ghost.setAttribute('aria-hidden', 'true');
      ghost.inert = true;
      ghost.style.width = `${rect.width}px`;
      ghost.style.left = `${rect.left}px`;
      const clone = row.cloneNode(true);
      clone.removeAttribute('data-track-row');
      clone.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
      [...clone.cells].forEach((cell, i) => { cell.style.width = `${row.cells[i].getBoundingClientRect().width}px`; });
      const body = document.createElement('tbody');
      body.append(clone); ghost.append(body); document.body.append(ghost);
      row.classList.add('music-sort-placeholder');
      document.documentElement.classList.add('music-sorting');
      handle.setAttribute('aria-pressed', 'true');
      frame = requestAnimationFrame(tick);
    };
    const finish = (cancel = false) => {
      scope.abort();
      cancelDrag = () => {};
      cancelAnimationFrame(frame);
      if (!ghost) return;
      if (cancel) rearrange(() => initial.forEach((el) => row.parentElement.append(el)));
      active = false;
      dragging(false);
      document.documentElement.classList.remove('music-sorting');
      handle.setAttribute('aria-pressed', 'false');
      row.getAnimations().forEach((animation) => animation.cancel());
      const landing = row.getBoundingClientRect();
      const floating = ghost;
      const done = () => { floating.remove(); row.classList.remove('music-sort-placeholder'); };
      if (reduced()) done();
      else floating.animate([
        { transform: floating.style.transform },
        { transform: `translateY(${landing.top}px) scale(1)` },
      ], { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }).finished.then(done, done);
      if (!cancel && rows().some((el, i) => el !== initial[i])) changed();
      handle.focus({ preventScroll: true });
    };
    cancelDrag = () => finish(true);
    window.addEventListener('pointermove', (e) => {
      if (e.pointerId !== event.pointerId) return;
      pointerY = e.clientY;
      if (!ghost && Math.hypot(e.clientX - initialX, pointerY - initialY) >= 5) start();
      update();
    }, options);
    window.addEventListener('pointerup', (e) => { if (e.pointerId === event.pointerId) finish(); }, options);
    window.addEventListener('pointercancel', () => finish(true), options);
    window.addEventListener('blur', () => finish(true), options);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); finish(true); } }, options);
  }, { signal });
}
