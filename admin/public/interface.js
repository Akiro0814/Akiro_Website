import { normalizeAppearance, filterCommands } from './ui-model.js?v=20261020-align-2';
import {
  appear,
  dismiss,
  slideThumb,
  installMotion,
  animateNumber,
  animateCharts,
  motionOff,
  tween,
  typeOut,
} from './motion.js?v=20261020-align-2';
import { initVisualizations } from './visualizations.js?v=20261020-align-2';
import { initLoginScene } from './login-scene.js?v=20261020-align-2';
import { enhanceStudio } from './studio-motion.js?v=20261020-align-2';

const make = (tag, cls, text) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
};
let appearance;
try {
  appearance = normalizeAppearance(JSON.parse(localStorage.getItem('blog.appearance')));
} catch {
  appearance = normalizeAppearance(null);
}
const themeQuery = matchMedia('(prefers-color-scheme: dark)');
function applyAppearance() {
  const root = document.documentElement;
  root.dataset.theme =
    appearance.theme === 'auto' ? (themeQuery.matches ? 'dark' : 'light') : appearance.theme;
  root.dataset.density = appearance.density;
  document.querySelector('.app')?.classList.toggle('is-collapsed', appearance.collapsed);
  document.getElementById('rail-toggle')?.setAttribute('aria-expanded', String(!appearance.collapsed));
  try {
    localStorage.setItem('blog.appearance', JSON.stringify(appearance));
  } catch {
    /* Browser storage may be disabled. */
  }
  requestAnimationFrame(syncNavigation);
  document.dispatchEvent(new CustomEvent('blog:appearance'));
}
themeQuery.addEventListener('change', () => {
  if (appearance.theme === 'auto') applyAppearance();
});
let overlays = [];
let popClose = null;
let latestPointer = null;

export function openDialog(title, { width, command = false } = {}) {
  popClose?.();
  const previous = document.activeElement;
  const cover = make('div', 'pearl-overlay');
  const panel = make('section', `pearl-dialog${command ? ' pearl-command' : ''}`);
  if (width) panel.style.width = width;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', title);
  const head = make('header', 'pearl-dialog__head');
  head.append(make('h2', '', title));
  const close = make('button', 'icon-button', '×');
  close.type = 'button';
  close.setAttribute('aria-label', `关闭${title}`);
  head.append(close);
  const body = make('div', 'pearl-dialog__body');
  const foot = make('footer', 'pearl-dialog__foot');
  panel.append(head, body, foot);
  cover.append(panel);
  document.body.append(cover);
  const app = document.querySelector('.app');
  const lower = overlays.at(-1);
  if (lower) lower.panel.inert = true;
  if (app) app.inert = true;
  let closing = false,
    closed = false;
  const controller = new AbortController();
  const { signal } = controller;
  const handle = {
    signal,
    panel,
    body,
    foot,
    cover,
    closed: () => closed,
    async close() {
      if (closing) return;
      closing = true;
      await dismiss(panel);
      controller.abort();
      cover.remove();
      closed = true;
      overlays = overlays.filter((x) => x !== handle);
      const top = overlays.at(-1);
      if (top) top.panel.inert = false;
      else if (app) app.inert = false;
      if (previous?.isConnected) previous.focus();
      handle.onClose?.();
    },
  };
  overlays.push(handle);
  close.addEventListener('click', () => handle.close(), { signal });
  cover.addEventListener(
    'click',
    (e) => {
      if (e.target === cover) handle.close();
    },
    { signal }
  );
  cover.addEventListener(
    'keydown',
    (e) => {
      if (overlays.at(-1) !== handle) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handle.close();
      }
      if (e.key === 'Tab') {
        const list = [
          ...panel.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]'),
        ].filter((el) => !el.disabled && !el.hidden && el.getClientRects().length);
        if (!list.length) {
          e.preventDefault();
          return;
        }
        const first = list[0],
          last = list.at(-1);
        if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    { signal }
  );
  appear(panel, 'panel', latestPointer);
  requestAnimationFrame(() => panel.querySelector('input,button')?.focus());
  return handle;
}

let confirmPending = null;
export function confirmAction(message) {
  if (confirmPending) return Promise.resolve(false);
  return new Promise((resolve) => {
    const dialog = openDialog('确认操作');
    confirmPending = dialog;
    dialog.body.append(make('p', '', message));
    const cancel = make('button', 'btn', '取消'),
      ok = make('button', 'btn btn--primary', /删除|清空|丢弃/.test(message) ? '确认操作' : '确认');
    cancel.type = ok.type = 'button';
    dialog.foot.append(cancel, ok);
    let accepted = false;
    dialog.onClose = () => {
      confirmPending = null;
      resolve(accepted);
    };
    cancel.addEventListener('click', () => dialog.close());
    ok.addEventListener('click', () => {
      accepted = true;
      dialog.close();
    });
    requestAnimationFrame(() => cancel.focus());
  });
}

const toastCards = [];
let toastHost;
export function notify(message, isError = false) {
  if (!toastHost) {
    toastHost = make('div', 'pearl-toast-stack');
    document.body.append(toastHost);
  }
  const card = make('div', `pearl-toast${isError ? ' is-error' : ''}`);
  card.setAttribute('role', isError ? 'alert' : 'status');
  const dot = make('span', 'pearl-toast-dot');
  dot.setAttribute('aria-hidden', 'true');
  const text = make('p', '', message);
  const close = make('button', 'pearl-toast-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', '关闭提示');
  close.insertAdjacentHTML(
    'beforeend',
    '<svg class="pearl-toast-ring" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="9"/></svg>'
  );
  card.append(dot, text, close);
  toastHost.append(card);
  appear(card);
  let remaining = 4500,
    started = 0,
    timer = 0,
    done = false;
  const ring = card.querySelector('circle');
  const remove = async () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    await dismiss(card);
    card.remove();
    toastCards.splice(toastCards.indexOf(rec), 1);
  };
  const pause = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = 0;
    remaining = Math.max(0, remaining - (performance.now() - started));
    window.gsap?.killTweensOf(ring);
  };
  const resume = () => {
    if (done) return;
    clearTimeout(timer);
    started = performance.now();
    timer = setTimeout(remove, remaining);
    tween(ring, { strokeDashoffset: 56.55, duration: remaining / 1000, ease: 'none' });
  };
  const rec = { pause, resume, remove };
  toastCards.push(rec);
  close.addEventListener('click', remove);
  if (toastCards.length > 4) toastCards[0].remove();
  if (!toastHost.dataset.bound) {
    toastHost.dataset.bound = 'true';
    toastHost.addEventListener('pointerenter', () => toastCards.forEach((x) => x.pause()));
    toastHost.addEventListener('pointerleave', () => toastCards.forEach((x) => x.resume()));
    toastHost.addEventListener('focusin', () => toastCards.forEach((x) => x.pause()));
    toastHost.addEventListener('focusout', () => toastCards.forEach((x) => x.resume()));
  }
  resume();
}

export function segmented(options, value, onChange, signal) {
  const box = make('div', 'pearl-segment');
  box.setAttribute('role', 'group');
  const thumb = make('span', 'pearl-slider');
  thumb.setAttribute('aria-hidden', 'true');
  box.append(thumb);
  const sync = (immediate = false) => {
    if (!box.isConnected || signal?.aborted) return;
    const active = box.querySelector('[aria-pressed="true"]');
    if (active) {
      box.classList.add('has-slider');
      slideThumb(thumb, active, immediate);
    }
  };
  for (const option of options) {
    const btn = make('button', '', option.label);
    btn.type = 'button';
    btn.setAttribute('aria-pressed', String(option.value === value));
    box.append(btn);
    btn.addEventListener('click', () => {
      for (const b of box.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === btn));
      sync();
      onChange(option.value);
    }, { signal });
  }
  // 密度、字体加载与窄屏换行都会改变尺寸。观察容器和按钮的布局尺寸，
  // 重新测量时直接归位，不从旧尺寸反复补间；transform 按压不会触发此观察器。
  const observer = new ResizeObserver(() => sync(true));
  observer.observe(box);
  box.querySelectorAll('button').forEach((button) => observer.observe(button));
  signal?.addEventListener('abort', () => {
    observer.disconnect();
    window.gsap?.killTweensOf(thumb);
  }, { once:true });
  requestAnimationFrame(() => sync(true));
  return box;
}

function showAppearance() {
  const dialog = openDialog('外观设置');
  for (const [title, description, key, options] of [
    [
      '主题',
      '暖色材质随外观自动适配',
      'theme',
      [
        { label: '浅色', value: 'light' },
        { label: '深色', value: 'dark' },
        { label: '跟随系统', value: 'auto' },
      ],
    ],
    [
      '表格密度',
      '影响列表行高与控件留白',
      'density',
      [
        { label: '宽松', value: 'comfy' },
        { label: '标准', value: 'regular' },
        { label: '紧凑', value: 'compact' },
      ],
    ],
  ]) {
    const row = make('div', 'pref-row'),
      label = make('div', '', title);
    label.append(make('small', '', description));
    row.append(
      label,
      segmented(options, appearance[key], (v) => {
        appearance[key] = v;
        applyAppearance();
      }, dialog.signal)
    );
    dialog.body.append(row);
  }
  dialog.body.append(
    make('p', 'field__hint', '偏好仅保存在当前浏览器。系统开启“减少动态效果”时自动简化动画。')
  );
  const done = make('button', 'btn btn--primary', '完成');
  done.type = 'button';
  done.addEventListener('click', () => dialog.close());
  dialog.foot.append(done);
}

function syncNavigation() {
  const active = document.querySelector('.nav__item--active');
  slideThumb(document.querySelector('.nav-thumb'), active);
  document.querySelectorAll('.nav__item').forEach((a) => {
    if (a === active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const title = document.getElementById('pearl-page-title');
  if (title) title.textContent = document.title.split(' · ')[0];
}

function showUserMenu(trigger) {
  showPopover(trigger, [
    { label: '外观设置', run: showAppearance },
    { label: '搜索与快捷操作', run: showCommands },
    { label: '查看网站', run: () => window.open('/', '_blank', 'noopener') },
    {
      label: '退出登录',
      danger: true,
      run: async () => {
        if (await confirmAction('确认退出当前账号吗？')) document.getElementById('logout')?.click();
      },
    },
  ]);
}

function showPopover(trigger, items) {
  popClose?.();
  const menu = make('div', 'pearl-popover');
  menu.setAttribute('role', 'menu');
  const r = trigger.getBoundingClientRect();
  menu.style.top = `${r.bottom + 8}px`;
  menu.style.right = `${Math.max(12, innerWidth - r.right)}px`;
  const controller = new AbortController();
  const { signal } = controller;
  const close = () => {
    controller.abort();
    menu.remove();
    trigger.setAttribute('aria-expanded', 'false');
    popClose = null;
  };
  popClose = close;
  for (const item of items) {
    const button = make('button', `pearl-menu-item${item.danger ? ' is-danger' : ''}`, item.label);
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.addEventListener('click', () => {
      close();
      item.run();
    });
    menu.append(button);
  }
  document.body.append(menu);
  trigger.setAttribute('aria-expanded', 'true');
  appear(menu, 'pop');
  menu.querySelector('button')?.focus();
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!menu.contains(event.target) && !trigger.contains(event.target)) close();
    },
    { signal, capture: true }
  );
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') {
        event.stopImmediatePropagation();
        close();
        trigger.focus();
      }
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
        const buttons = [...menu.querySelectorAll('button')],
          i = buttons.indexOf(document.activeElement);
        buttons[(i + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
      }
      if (event.key === 'Tab') close();
    },
    { signal, capture: true }
  );
}

function showCommands() {
  if (overlays.some((x) => x.panel.classList.contains('pearl-command'))) return;
  const dialog = openDialog('搜索与快捷操作', { command: true });
  dialog.panel.querySelector('header').hidden = true;
  dialog.body.className = '';
  dialog.foot.className = 'command-foot';
  dialog.foot.textContent = '↑ ↓ 选择　 Enter 打开　 Esc 关闭　 ? 查看写作帮助';
  const input = make('input', 'command-input');
  input.placeholder = '搜索页面，或输入 ? 查看帮助';
  input.setAttribute('aria-label', '搜索页面与操作');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'true');
  input.setAttribute('aria-controls', 'command-results');
  input.setAttribute('aria-autocomplete', 'list');
  const results = make('div', 'command-results');
  results.id = 'command-results';
  results.setAttribute('role', 'listbox');
  dialog.body.append(input, results);
  const links = [...document.querySelectorAll('.nav__item:not([target])')].map((a) => ({
    label: a.textContent.trim(),
    href: a.getAttribute('href'),
  }));
  let rows = [],
    index = 0;
  const setActive = () => {
    rows.forEach((r, i) => {
      r.classList.toggle('is-active', i === index);
      r.setAttribute('aria-selected', String(i === index));
    });
    input.setAttribute('aria-activedescendant', rows[index]?.id || '');
    rows[index]?.scrollIntoView({ block: 'nearest' });
  };
  const render = () => {
    results.replaceChildren();
    index = 0;
    rows = [];
    if (/^[?？]/.test(input.value)) {
      const answers = [
        ['如何让文章上线？', '保存文章后，到“构建发布”执行构建并发布。保存只更新源文件。', '/admin/build'],
        [
          '如何恢复删除的文章？',
          '到文章或随笔页面的回收站恢复。路径冲突时需先处理已有内容。',
          '/admin/posts',
        ],
        ['回滚会恢复哪些内容？', '回滚切换静态发布版本，不恢复源文件、评论或其他动态数据。', '/admin/build'],
      ];
      answers.forEach(([title, body, href]) => {
        const card = make('div', 'pearl-answer');
        const paragraph = make('p', '', body);
        card.append(make('strong', '', title), paragraph);
        const a = make('a', 'btn btn--sm', '打开相关页面');
        a.href = href;
        a.addEventListener('click', () => dialog.close());
        card.append(a);
        results.append(card);
        typeOut(paragraph, body, dialog.signal);
      });
      appear(results);
      return;
    }
    const entries = filterCommands(links, input.value);
    for (const entry of entries) {
      const button = make('button', 'command-row', entry.label);
      button.type = 'button';
      button.id = `command-result-${rows.length}`;
      button.setAttribute('role', 'option');
      button.tabIndex = -1;
      button.append(make('small', '', entry.href));
      button.addEventListener('click', async () => {
        await dialog.close();
        document.querySelector(`.nav__item[href="${entry.href}"]`)?.click();
      });
      rows.push(button);
      results.append(button);
    }
    if (!input.value.trim()) {
      const action = make('button', 'command-row', '外观设置');
      action.id = `command-result-${rows.length}`;
      action.setAttribute('role', 'option');
      action.tabIndex = -1;
      action.addEventListener('click', async () => {
        await dialog.close();
        showAppearance();
      });
      rows.push(action);
      results.append(action);
    }
    if (!rows.length) results.append(make('p', 'empty', '没有匹配的页面。'));
    setActive();
  };
  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => {
    if (['ArrowDown', 'ArrowUp'].includes(e.key) && rows.length) {
      e.preventDefault();
      index = (index + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
      setActive();
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      rows[index]?.click();
    }
  });
  render();
  requestAnimationFrame(() => input.focus());
}

function enhanceSelect(select, signal) {
  if (select.multiple || select.size > 1 || select.closest('.pearl-select-wrap')) return;
  const wrap = make('span', 'pearl-select-wrap');
  select.before(wrap);
  wrap.append(select);
  const trigger = make('button', 'input pearl-select-trigger');
  trigger.type = 'button';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', select.getAttribute('aria-label') || select.title || '选择选项');
  wrap.append(trigger);
  wrap.classList.add('is-enhanced');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  const sync = () => {
    trigger.textContent = select.selectedOptions[0]?.textContent || '请选择';
    trigger.append(make('span', '', '⌄'));
    trigger.disabled = select.disabled;
  };
  sync();
  select.addEventListener('change', sync, { signal });
  const observer = new MutationObserver(sync);
  observer.observe(select, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled', 'selected'],
  });
  signal.addEventListener('abort', () => observer.disconnect(), { once: true });
  trigger.addEventListener(
    'click',
    () => {
      popClose?.();
      const pop = make('div', 'pearl-popover pearl-pop-select');
      pop.setAttribute('role', 'listbox');
      pop.setAttribute('aria-label', trigger.getAttribute('aria-label'));
      const r = trigger.getBoundingClientRect();
      Object.assign(pop.style, {
        left: `${Math.min(r.left, innerWidth - 220)}px`,
        top: `${Math.min(r.bottom + 6, innerHeight - 310)}px`,
        minWidth: `${Math.max(r.width, 150)}px`,
      });
      const ctrl = new AbortController();
      const close = () => {
        pop.remove();
        ctrl.abort();
        trigger.setAttribute('aria-expanded', 'false');
        popClose = null;
      };
      popClose = close;
      signal.addEventListener('abort', close, { once: true });
      for (const option of select.options) {
        const button = make('button', 'pearl-menu-item', option.textContent);
        button.type = 'button';
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', String(option.selected));
        button.disabled = option.disabled;
        button.addEventListener('click', () => {
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          sync();
          close();
          trigger.focus();
        });
        pop.append(button);
      }
      document.body.append(pop);
      trigger.setAttribute('aria-expanded', 'true');
      appear(pop, 'pop');
      pop.querySelector('[aria-selected="true"]')?.focus();
      document.addEventListener(
        'pointerdown',
        (e) => {
          if (!pop.contains(e.target) && !trigger.contains(e.target)) close();
        },
        { signal: ctrl.signal, capture: true }
      );
      document.addEventListener(
        'keydown',
        (e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopImmediatePropagation();
            close();
            trigger.focus();
          }
          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
            e.preventDefault();
            const buttons = [...pop.querySelectorAll('button:not(:disabled)')],
              i = buttons.indexOf(document.activeElement);
            buttons[
              e.key === 'Home'
                ? 0
                : e.key === 'End'
                  ? buttons.length - 1
                  : (i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
            ]?.focus();
          }
          if (e.key === 'Tab') close();
        },
        { signal: ctrl.signal, capture: true }
      );
    },
    { signal }
  );
}

function enhanceTables(root, signal) {
  root.querySelectorAll('.table').forEach((table, tableIndex) => {
    if (
      table.dataset.pearlTable ||
      table.closest('#trash-card') ||
      table.closest('#dash-root') ||
      table.querySelector('#music-rows') ||
      table.querySelector('[data-track-row]')
    )
      return;
    const rows = [...(table.tBodies[0]?.rows || [])];
    if (!rows.length || rows.some((r) => r.querySelector('[colspan]'))) return;
    table.dataset.pearlTable = 'true';
    const wrap = table.closest('.table-wrap');
    if (!wrap) return;
    const tools = make('div', 'pearl-table-tools');
    const input = make('input', 'input');
    input.type = 'search';
    input.placeholder = '筛选当前列表…';
    input.setAttribute('aria-label', `筛选列表 ${tableIndex + 1}`);
    const count = make('span', 'field__hint');
    const download = make('button', 'btn btn--sm', '导出列表');
    download.type = 'button';
    tools.append(input, count, download);
    wrap.before(tools);
    const paging = make('div', 'pearl-pagination');
    const prev = make('button', 'btn btn--sm', '上一页'),
      next = make('button', 'btn btn--sm', '下一页'),
      label = make('span', '');
    prev.type = next.type = 'button';
    paging.append(label, prev, next);
    wrap.after(paging);
    let page = 0;
    const size = 15;
    const apply = () => {
      const query = input.value.trim().toLowerCase(),
        matches = rows.filter((row) => row.textContent.toLowerCase().includes(query));
      const pages = Math.max(1, Math.ceil(matches.length / size));
      page = Math.min(page, pages - 1);
      const shown = new Set(matches.slice(page * size, (page + 1) * size));
      rows.forEach((row) => (row.hidden = !shown.has(row)));
      count.textContent = `${matches.length} 条记录`;
      label.textContent = `${page + 1} / ${pages} 页`;
      prev.disabled = page === 0;
      next.disabled = page >= pages - 1;
      paging.hidden = matches.length <= size;
    };
    input.addEventListener(
      'input',
      () => {
        page = 0;
        apply();
      },
      { signal }
    );
    prev.addEventListener(
      'click',
      () => {
        page--;
        apply();
      },
      { signal }
    );
    next.addEventListener(
      'click',
      () => {
        page++;
        apply();
      },
      { signal }
    );
    apply();
    download.addEventListener(
      'click',
      () => {
        const csvCell = (value) =>
          `"${String(value)
            .replace(/^[=+@-]/, "'$&")
            .replaceAll('"', '""')}"`;
        const query = input.value.trim().toLowerCase();
        const selected = rows.filter((row) => row.textContent.toLowerCase().includes(query));
        const cells = (row) =>
          [...row.cells]
            .filter((cell) => !cell.matches('.cell-actions') && !cell.hasAttribute('aria-label'))
            .map((cell) => csvCell(cell.textContent.trim()))
            .join(',');
        const csv = [cells(table.tHead.rows[0]), ...selected.map(cells)].join('\r\n');
        const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
        const a = make('a');
        a.href = url;
        a.download = `博客列表-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      { signal }
    );
  });
}

function enhanceHover(root, signal) {
  let timer = 0,
    preview;
  const close = () => {
    clearTimeout(timer);
    preview?.remove();
    preview = null;
  };
  const show = (target) => {
    close();
    timer = setTimeout(() => {
      if (!target.isConnected) return;
      const image = target.matches('img') ? target : target.querySelector('img');
      if (!image) return;
      preview = make('div', 'pearl-hover-preview');
      const copy = make('img');
      copy.src = image.currentSrc || image.src;
      copy.alt = image.alt || '图片预览';
      preview.append(
        copy,
        make('p', '', image.alt || target.querySelector('code')?.textContent || '图片预览')
      );
      const r = target.getBoundingClientRect();
      Object.assign(preview.style, {
        left: `${Math.max(12, Math.min(r.left, innerWidth - 320))}px`,
        top: `${Math.max(12, Math.min(r.bottom + 8, innerHeight - 270))}px`,
      });
      document.body.append(preview);
      appear(preview, 'pop');
    }, 300);
  };
  root.addEventListener(
    'pointerover',
    (e) => {
      const target = e.target.closest('.media-item');
      if (target && !target.contains(e.relatedTarget)) show(target);
    },
    { signal }
  );
  root.addEventListener(
    'pointerout',
    (e) => {
      const target = e.target.closest('.media-item');
      if (target && !target.contains(e.relatedTarget)) close();
    },
    { signal }
  );
  root.addEventListener(
    'focusin',
    (e) => {
      const target = e.target.closest('.media-item');
      if (target) show(target);
    },
    { signal }
  );
  root.addEventListener('focusout', close, { signal });
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape') close();
    },
    { signal }
  );
  signal.addEventListener('abort', close, { once: true });
}

export function initInterface() {
  installMotion();
  applyAppearance();
  initLoginScene();
  document.addEventListener(
    'pointerdown',
    (e) => {
      latestPointer = e.target.closest('button,a,tr');
    },
    { passive: true }
  );
  document.getElementById('appearance-open')?.addEventListener('click', showAppearance);
  document.getElementById('command-open')?.addEventListener('click', showCommands);
  document.getElementById('user-menu-open')?.addEventListener('click', (e) => showUserMenu(e.currentTarget));
  const app = document.querySelector('.app');
  const toggle = document.getElementById('rail-toggle');
  toggle?.addEventListener('click', () => {
    if (matchMedia('(max-width:820px)').matches) {
      const open = app.classList.toggle('is-mobile-open');
      toggle.setAttribute('aria-expanded', String(open));
      let scrim = document.querySelector('.pearl-rail-scrim');
      if (open && !scrim) {
        scrim = make('div', 'pearl-rail-scrim');
        scrim.addEventListener('click', () => {
          app.classList.remove('is-mobile-open');
          scrim.remove();
          toggle.setAttribute('aria-expanded', 'false');
        });
        app.append(scrim);
      } else scrim?.remove();
    } else {
      appearance.collapsed = !appearance.collapsed;
      applyAppearance();
    }
  });
  window.addEventListener('resize', () => {
    syncNavigation();
    if (innerWidth > 820) {
      app?.classList.remove('is-mobile-open');
      document.querySelector('.pearl-rail-scrim')?.remove();
    }
  });
  window.addEventListener(
    'scroll',
    () => document.querySelector('.pearl-topbar')?.classList.toggle('is-scrolled', scrollY > 8),
    { passive: true }
  );
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && app && !overlays.length) {
      e.preventDefault();
      showCommands();
    }
  });
  const entrance = document.querySelectorAll('.sidebar .brand,.nav__group,.pearl-topbar > *');
  if (entrance.length && window.gsap && !motionOff())
    window.gsap.fromTo(
      entrance,
      { opacity: 0, y: 8 },
      { opacity: 1, y: 0, duration: 0.6, stagger: 0.035, ease: 'expo.out', clearProps: 'opacity,transform' }
    );
}

export function enhancePage(root, signal) {
  if (!root) return;
  enhanceStudio(root, signal);
  popClose?.();
  syncNavigation();
  document.querySelector('.app')?.classList.remove('is-mobile-open');
  document.querySelector('.pearl-rail-scrim')?.remove();
  root.querySelectorAll('select').forEach((select) => enhanceSelect(select, signal));
  enhanceTables(root, signal);
  enhanceHover(root, signal);
  initVisualizations(root, signal, (options, value, onChange) => segmented(options, value, onChange, signal));
  root.querySelectorAll('.stat__value').forEach(animateNumber);
  animateCharts(root);
  // Inline business editors gain the same reveal treatment without changing their IDs or bindings.
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      const el = record.target;
      if (record.attributeName === 'hidden' && !el.hidden && el.matches('.card,.modal'))
        appear(el.matches('.modal') ? el.querySelector('.modal__card') : el, 'panel', latestPointer);
    }
  });
  observer.observe(root, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
  signal.addEventListener('abort', () => observer.disconnect(), { once: true });
  initSettingsDrawer(root, signal);
}

function initSettingsDrawer(root, signal) {
  const side = root.querySelector('.editor__side');
  const bar = root.querySelector('.editor__topbar-actions');
  if (!side || !bar) return;
  const trigger = make('button', 'btn btn--sm', '文章设置');
  trigger.type = 'button';
  trigger.setAttribute('aria-expanded', 'false');
  bar.prepend(trigger);
  const scrim = make('div', 'pearl-settings-scrim');
  scrim.hidden = true;
  side.before(scrim);
  side.classList.add('pearl-settings-drawer');
  side.hidden = true;
  side.setAttribute('role', 'dialog');
  side.setAttribute('aria-modal', 'true');
  side.setAttribute('aria-label', '文章设置');
  const close = make('button', 'icon-button pearl-settings-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', '关闭文章设置');
  side.prepend(close);
  let busy = false;
  const hide = async () => {
    if (side.hidden || busy) return;
    busy = true;
    await dismiss(side, 'drawer', trigger);
    side.hidden = true;
    scrim.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.focus();
    busy = false;
  };
  trigger.addEventListener(
    'click',
    () => {
      if (!side.hidden) {
        hide();
        return;
      }
      side.hidden = false;
      scrim.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      appear(side, 'drawer', trigger);
      close.focus();
    },
    { signal }
  );
  close.addEventListener('click', hide, { signal });
  scrim.addEventListener('click', hide, { signal });
  side.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        hide();
      }
      if (e.key === 'Tab') {
        const nodes = [...side.querySelectorAll('button,input,textarea,select')].filter(
          (el) => !el.disabled && el.getClientRects().length
        );
        if (e.shiftKey && document.activeElement === nodes[0]) {
          e.preventDefault();
          nodes.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
          e.preventDefault();
          nodes[0]?.focus();
        }
      }
    },
    { signal }
  );
}

export async function loginSuccess(button) {
  if (!button || motionOff()) return;
  const orb = make('div', 'login-success');
  orb.setAttribute('role', 'status');
  orb.setAttribute('aria-label', '登录成功');
  orb.style.width = `${button.offsetWidth}px`;
  orb.innerHTML =
    '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m9 16 5 5 9-10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  button.hidden = true;
  button.after(orb);
  document.dispatchEvent(new Event('blog:login-success'));
  if (window.gsap)
    await new Promise((resolve) => {
      const tl = window.gsap.timeline({ onComplete: resolve });
      tl.to(orb, { width: 46, borderRadius: 23, duration: 0.4, ease: 'power2.inOut' });
      for (const path of orb.querySelectorAll('circle,path')) {
        const n = path.getTotalLength();
        tl.fromTo(
          path,
          { strokeDasharray: n, strokeDashoffset: n },
          { strokeDashoffset: 0, duration: 0.35, ease: 'expo.out' },
          '-=.1'
        );
      }
      tl.to(orb, { scale: 1.06, duration: 0.12 }).to(orb, { scale: 1, duration: 0.2 });
    });
}
