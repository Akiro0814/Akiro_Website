import { contentGraph, dailyHeat } from './ui-model.js?v=20261020-align-2';
import { appear, frameLoop, motionOff, flipLayout } from './motion.js?v=20261020-align-2';

const make = (tag, cls, text) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
};

function relationStage(host, graph, signal) {
  const stage = make('div', 'pearl-stage');
  stage.tabIndex = 0;
  stage.setAttribute('aria-label', '内容关系画布，方向键平移，加减键缩放');
  const canvas = make('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const layer = make('div', 'pearl-stage-layer');
  const tools = make('div', 'pearl-stage-tools');
  const caption = make('div', 'pearl-stage-caption', '拖动画布平移 · + / − 缩放 · 点击分类查看内容');
  const insight = make('div', 'pearl-insight', '选择分类或内容，查看关联信息。');
  insight.setAttribute('aria-live', 'polite');
  stage.append(canvas, layer, tools, caption);
  host.append(stage, insight);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  let w = 0,
    h = 460,
    panX = 0,
    panY = 0,
    zoom = 1,
    paused = false,
    selected = null,
    epoch = performance.now() / 1000;
  const groups = graph.groups.slice(0, 12),
    items = graph.items.slice(0, 60);
  const nodes = [];
  let activeItems = items.slice(0, 10);
  const buttons = [];
  const select = (node) => {
    selected = node.id;
    layer
      .querySelectorAll('button')
      .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.node === node.id)));
    insight.replaceChildren();
    if (node.group) {
      const matches = graph.items.filter((item) => item.categories.includes(node.label));
      activeItems = items.filter((item) => item.categories.includes(node.label)).slice(0, 16);
      layout();
      insight.append(make('strong', '', `${node.label} · ${matches.length} 项`));
      const list = make('div', 'pearl-insight-links');
      for (const item of matches) {
        const a = make('a', 'btn btn--sm', item.title);
        a.href = item.href;
        list.append(a);
      }
      insight.append(list);
    } else {
      insight.append(
        make('strong', '', node.title),
        make('p', '', `${node.categories.join(' / ')} · ${node.draft ? '草稿' : '已发布'}`)
      );
      const a = make('a', 'btn btn--sm btn--primary', '编辑内容');
      a.href = node.href;
      insight.append(a);
    }
    appear(insight);
  };
  for (const group of groups) {
    const node = { ...group, group: true };
    nodes.push(node);
  }
  nodes.push(...items);
  for (const node of nodes) {
    const button = make(
      'button',
      `pearl-node${node.group ? ' is-hub' : ''}`,
      node.group ? `${node.label} · ${node.count}` : node.title
    );
    button.type = 'button';
    button.dataset.node = node.id;
    button.setAttribute('aria-pressed', 'false');
    button.title = node.group ? node.label : node.title;
    button.addEventListener('click', () => select(node), { signal });
    layer.append(button);
    buttons.push(button);
  }
  const layout = () => {
    const r = stage.getBoundingClientRect();
    w = r.width;
    h = innerWidth <= 820 ? 400 : 460;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    groups.forEach((g, i) => {
      const node = nodes.find((n) => n.id === g.id),
        angle = (i / Math.max(1, groups.length)) * Math.PI * 2 - Math.PI / 2;
      node.x = w / 2 + Math.cos(angle) * Math.min(w * 0.24, 180);
      node.y = h / 2 + Math.sin(angle) * 110;
    });
    activeItems.forEach((item, i) => {
      const node = nodes.find((n) => n.id === item.id),
        angle = (i / Math.max(1, activeItems.length)) * Math.PI * 2;
      node.x = w / 2 + Math.cos(angle) * Math.min(w * 0.38, 340);
      node.y = h / 2 + Math.sin(angle) * 175;
    });
    buttons.forEach((button, i) => {
      const node = nodes[i];
      node.visible = node.group || activeItems.some((item) => item.id === node.id);
      button.hidden = !node.visible;
      button.style.left = `${node.x || 0}px`;
      button.style.top = `${node.y || 0}px`;
    });
    if (motionOff()) draw(0);
  };
  const transform = () => {
    layer.style.transform = `translate(${panX}px,${panY}px) scale(${zoom})`;
    if (motionOff() || paused) draw(0);
  };
  const draw = (time) => {
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);
    const style = getComputedStyle(stage),
      rose = style.getPropertyValue('--rose').trim(),
      border = style.getPropertyValue('--border-strong').trim();
    const elapsed = motionOff() || paused ? 10 : Math.max(0, time - epoch);
    for (const link of graph.links) {
      const a = nodes.find((n) => n.id === link.from),
        b = nodes.find((n) => n.id === link.to);
      if (!a || !b || !a.visible || !b.visible) continue;
      ctx.strokeStyle = selected === a.id || selected === b.id ? rose : border;
      ctx.globalAlpha = selected && selected !== a.id && selected !== b.id ? 0.22 : 0.6;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      const u = Math.min(1, elapsed * 1.4);
      ctx.quadraticCurveTo(w / 2, h / 2, a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u);
      ctx.stroke();
      if (!paused && !motionOff()) {
        const p = (time * 0.2 + nodes.indexOf(b) * 0.09) % 1;
        const x = (1 - p) * (1 - p) * a.x + (2 * (1 - p) * p * w) / 2 + p * p * b.x,
          y = (1 - p) * (1 - p) * a.y + (2 * (1 - p) * p * h) / 2 + p * p * b.y;
        ctx.fillStyle = rose;
        ctx.globalAlpha = 0.18;
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    const radius = 35;
    const gradient = ctx.createRadialGradient(w / 2 - 12, h / 2 - 15, 0, w / 2, h / 2, radius);
    gradient.addColorStop(0, style.getPropertyValue('--surface').trim());
    gradient.addColorStop(0.6, style.getPropertyValue('--rose-soft').trim());
    gradient.addColorStop(1, rose);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, radius, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2 + (motionOff() ? 0 : time * 0.025),
        r = radius + 12;
      ctx.strokeStyle = i < Math.min(60, graph.items.length) ? rose : border;
      ctx.beginPath();
      ctx.moveTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r);
      ctx.lineTo(
        w / 2 + Math.cos(a) * (r + (i % 5 === 0 ? 6 : 3)),
        h / 2 + Math.sin(a) * (r + (i % 5 === 0 ? 6 : 3))
      );
      ctx.stroke();
    }
    if (elapsed < 2)
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = Math.max(0, 0.3 - elapsed * 0.14);
        ctx.strokeStyle = rose;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, 45 + Math.max(0, elapsed - i * 0.15) * 100, 0, Math.PI * 2);
        ctx.stroke();
      }
    ctx.restore();
  };
  const observer = new ResizeObserver(layout);
  observer.observe(stage);
  layout();
  const loop = frameLoop(stage, draw);
  const button = (label, text, run) => {
    const b = make('button', 'icon-button', text);
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.title = label;
    b.addEventListener('click', run, { signal });
    tools.append(b);
    return b;
  };
  const changeZoom = (delta) => {
    zoom = Math.max(0.45, Math.min(2, zoom + delta));
    transform();
  };
  button('缩小画布', '−', () => changeZoom(-0.15));
  button('放大画布', '＋', () => changeZoom(0.15));
  button('重置画布', '⌾', () => {
    panX = panY = 0;
    zoom = 1;
    selected = null;
    layer.querySelectorAll('button').forEach((button) => button.setAttribute('aria-pressed', 'false'));
    insight.textContent = '选择分类或内容，查看关联信息。';
    activeItems = items.slice(0, 10);
    layout();
    transform();
  });
  const pause = button('暂停画布动效', 'Ⅱ', () => {
    paused = !paused;
    loop.pause(paused);
    pause.textContent = paused ? '▷' : 'Ⅱ';
    pause.setAttribute('aria-label', paused ? '播放画布动效' : '暂停画布动效');
  });
  button('重播画布动效', '↻', () => {
    epoch = performance.now() / 1000;
    paused = false;
    loop.pause(false);
    pause.textContent = 'Ⅱ';
    appear(layer);
  });
  let drag = null;
  stage.addEventListener(
    'pointerdown',
    (e) => {
      if (e.target.closest('button,a')) return;
      drag = { x: e.clientX, y: e.clientY, px: panX, py: panY };
      stage.setPointerCapture(e.pointerId);
    },
    { signal }
  );
  stage.addEventListener(
    'pointermove',
    (e) => {
      if (!drag) return;
      panX = drag.px + e.clientX - drag.x;
      panY = drag.py + e.clientY - drag.y;
      transform();
    },
    { signal }
  );
  stage.addEventListener('pointerup', () => (drag = null), { signal });
  stage.addEventListener('pointercancel', () => (drag = null), { signal });
  stage.addEventListener(
    'keydown',
    (e) => {
      if (e.target !== stage) return;
      const map = { ArrowLeft: [30, 0], ArrowRight: [-30, 0], ArrowUp: [0, 30], ArrowDown: [0, -30] };
      if (map[e.key]) {
        e.preventDefault();
        panX += map[e.key][0];
        panY += map[e.key][1];
        transform();
      }
      if (e.key === '+' || e.key === '=') changeZoom(0.15);
      if (e.key === '-') changeZoom(-0.15);
    },
    { signal }
  );
  const redraw = () => {
    if (motionOff() || paused) draw(0);
  };
  document.addEventListener('blog:appearance', redraw, { signal });
  if (graph.items.length > 10)
    caption.textContent = `点击分类展开关联内容 · 共 ${graph.items.length} 项，完整列表见表格`;
  signal.addEventListener(
    'abort',
    () => {
      loop.stop();
      observer.disconnect();
    },
    { once: true }
  );
}

function contentViews(root, signal, segmented) {
  const boot = window.__BOOT__ || {};
  if (!Array.isArray(boot.visualEntries)) return;
  const table = root.querySelector('.table-wrap');
  const card = table?.closest('.card');
  if (!card) return;
  const graph = contentGraph(boot.visualEntries, boot.collection);
  const toolbar = make('div', 'pearl-table-tools');
  const board = make('div', 'pearl-board');
  board.hidden = true;
  const scene = make('div', '');
  scene.hidden = true;
  const matrix = make('div', 'pearl-matrix');
  matrix.hidden = true;
  const timeline = make('div', 'pearl-timeline');
  timeline.hidden = true;
  contentTimeline(timeline, graph);
  const original = [...card.children];
  let mode = 'table';
  try {
    mode = localStorage.getItem(`blog.view.${boot.collection}`) || 'table';
  } catch {}
  if (!['table', 'board', 'graph', 'matrix', 'timeline'].includes(mode)) mode = 'table';
  const choose = (value) => {
    original.forEach((el) => (el.hidden = value !== 'table'));
    board.hidden = value !== 'board';
    scene.hidden = value !== 'graph';
    matrix.hidden = value !== 'matrix';
    timeline.hidden = value !== 'timeline';
    if (value === 'board') appear(board);
    if (value === 'matrix') appear(matrix);
    if (value === 'timeline') appear(timeline);
    if (value === 'graph') {
      if (!scene.children.length) relationStage(scene, graph, signal);
      appear(scene);
    }
    try {
      localStorage.setItem(`blog.view.${boot.collection}`, value);
    } catch {}
  };
  toolbar.append(
    make('span', 'field__hint', `${graph.items.length} 篇内容`),
    segmented(
      [
        { label: '表格', value: 'table' },
        { label: '看板', value: 'board' },
        { label: '矩阵', value: 'matrix' },
        { label: '时间线', value: 'timeline' },
        { label: '关系图', value: 'graph' },
      ],
      mode,
      choose
    )
  );
  card.prepend(toolbar);
  card.append(board, scene, matrix, timeline);
  const grid = make('table', '');
  grid.setAttribute('aria-label', '内容状态矩阵');
  const head = document.createElement('thead');
  const header = document.createElement('tr');
  for (const label of ['内容', '已发布', '草稿']) header.append(make('th', '', label));
  head.append(header);
  grid.append(head);
  const body = document.createElement('tbody');
  for (const item of graph.items) {
    const row = make('tr');
    const title = make('th');
    title.scope = 'row';
    const a = make('a', '', item.title);
    a.href = item.href;
    title.append(a);
    row.append(title);
    for (const [i, on] of [!item.draft, item.draft].entries()) {
      const cell = make('td', '');
      cell.dataset.column = String(i);
      const link = make('a', on ? 'matrix-dot is-on' : 'matrix-dot', on ? '●' : '—');
      link.href = item.href;
      link.setAttribute(
        'aria-label',
        `${item.title}：${i ? '草稿' : '已发布'}${on ? '，当前状态' : ''}，打开编辑`
      );
      cell.append(link);
      row.append(cell);
    }
    body.append(row);
  }
  grid.append(body);
  matrix.append(grid);
  matrix.addEventListener(
    'pointerover',
    (event) => {
      const td = event.target.closest('[data-column]');
      if (!td) return;
      matrix
        .querySelectorAll('[data-column]')
        .forEach((cell) => cell.classList.toggle('is-cross', cell.dataset.column === td.dataset.column));
    },
    { signal }
  );
  matrix.addEventListener(
    'pointerleave',
    () => matrix.querySelectorAll('.is-cross').forEach((cell) => cell.classList.remove('is-cross')),
    { signal }
  );
  for (const [name, predicate] of [
    ['已发布', (item) => !item.draft],
    ['草稿', (item) => item.draft],
  ]) {
    const list = graph.items.filter(predicate),
      column = make('section', 'pearl-board-column'),
      header = make('h3', '', name);
    header.append(make('span', '', String(list.length)));
    column.append(header);
    for (const item of list) {
      const a = make('a', 'pearl-board-card');
      a.href = item.href;
      a.append(make('strong', '', item.title), make('small', '', item.categories.join(' / ')));
      column.append(a);
    }
    if (!list.length) column.append(make('p', 'empty', '暂无内容'));
    board.append(column);
  }
  choose(mode);
}

function contentTimeline(host, graph) {
  const dated = graph.items.filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.date));
  if (!dated.length) {
    host.append(make('p', 'empty', '内容设置日期后，会在这里显示时间线。'));
    return;
  }
  const dates = dated.map((item) => Date.parse(`${item.date}T00:00:00Z`)).filter(Number.isFinite);
  const start = Math.min(...dates),
    end = Math.max(...dates),
    span = Math.max(86400000, end - start);
  const scale = make('div', 'pearl-time-scale');
  scale.append(
    make('span', '', new Date(start).toISOString().slice(0, 10)),
    make('span', '', new Date(end).toISOString().slice(0, 10))
  );
  host.append(scale);
  for (const group of graph.groups) {
    const lane = make('div', 'pearl-lane'),
      track = make('div', 'pearl-lane-track');
    lane.append(make('strong', '', group.label), track);
    const collisions = new Map();
    for (const item of dated.filter((item) => item.categories.includes(group.label))) {
      const mark = make('a', `pearl-time-mark${item.draft ? ' is-draft' : ''}`);
      mark.href = item.href;
      mark.style.left = `${5 + ((Date.parse(`${item.date}T00:00:00Z`) - start) / span) * 85}%`;
      const stack = collisions.get(item.date) || 0;
      collisions.set(item.date, stack + 1);
      mark.style.top = `${35 + Math.min(stack, 4) * 10}%`;
      mark.title = `${item.date} · ${item.title}${item.draft ? ' · 草稿' : ''}`;
      mark.setAttribute('aria-label', mark.title);
      track.append(mark);
    }
    host.append(lane);
  }
  host.append(make('p', 'field__hint', '按内容所设日期排列；空心标记为草稿，点击标记打开编辑。'));
}

function publishViews(root, signal) {
  const state = root.querySelector('#build-state');
  if (!state) return;
  const pipeline = make('div', 'pearl-pipeline');
  const labels = [
    ['内容准备', '保存的文章与页面内容'],
    ['构建站点', '生成静态页面与资源'],
    ['切换发布', '更新线上版本，随后备份'],
  ];
  const steps = labels.map(([title, description]) => {
    const step = make('div', 'pearl-step');
    step.append(make('strong', '', title), make('small', '', description));
    pipeline.append(step);
    return step;
  });
  root.querySelector('.page__head')?.after(pipeline);
  const sync = () => {
    const value = state.textContent.trim();
    steps.forEach((step, i) =>
      step.classList.toggle(
        'is-active',
        value === 'building' ? i === 1 : value === 'success' ? i === 2 : i === 0
      )
    );
  };
  sync();
  const observer = new MutationObserver(sync);
  observer.observe(state, { childList: true, subtree: true });
  signal.addEventListener('abort', () => observer.disconnect(), { once: true });
  const releases = root.querySelector('.releases');
  if (!releases?.querySelector('code')) return;
  const stair = make('div', 'pearl-versions');
  stair.setAttribute('aria-label', '发布版本阶梯');
  [...releases.querySelectorAll('li')].forEach((li, i) => {
    if (!li.querySelector('code')) return;
    const card = make('div', 'pearl-version');
    card.style.setProperty('--step', `${Math.min(i, 4) * 14}px`);
    card.append(
      make('strong', '', li.querySelector('.badge') ? '当前版本' : '历史版本'),
      make('code', '', li.querySelector('code').textContent)
    );
    stair.append(card);
  });
  releases.before(stair);
}

function settingsSamples(root, signal) {
  const save = root.querySelector('#profile-save');
  if (!save) return;
  const sections = [...root.querySelectorAll(':scope > .card')];
  const tray = make('div', 'pearl-floatbar');
  tray.hidden = true;
  const text = make('span', '');
  const jump = make('button', 'btn btn--sm btn--primary', '保存修改');
  jump.type = 'button';
  tray.append(text, jump);
  root.append(tray);
  const fields = () => [...root.querySelectorAll('input:not([type="hidden"]),textarea')];
  const value = (el) => (el.type === 'checkbox' ? String(el.checked) : el.value);
  const initial = new Map(fields().map((el) => [el, value(el)]));
  const update = () => {
    const wasHidden = tray.hidden;
    const count = fields().filter((el) => !initial.has(el) || initial.get(el) !== value(el)).length;
    tray.hidden = count === 0;
    text.textContent = `${count} 个字段有未保存修改`;
    if (count && wasHidden) appear(tray);
  };
  document.addEventListener(
    'blog:saved',
    (event) => {
      if (event.detail?.path === '/api/manage/profile') {
        initial.clear();
        fields().forEach((el) => initial.set(el, value(el)));
        tray.hidden = true;
      }
    },
    { signal }
  );
  root.addEventListener('input', update, { signal });
  root.addEventListener('change', update, { signal });
  jump.addEventListener('click', () => save.click(), { signal });
  for (const section of sections) {
    const header = section.querySelector('.card__title');
    if (!header) continue;
    header.tabIndex = 0;
    header.setAttribute('role', 'button');
    header.setAttribute('aria-expanded', 'true');
    const toggle = () =>
      flipLayout(sections, () => {
        const collapsed = section.classList.toggle('pearl-sample-collapsed');
        header.setAttribute('aria-expanded', String(!collapsed));
        for (const child of section.children) if (child !== header) child.hidden = collapsed;
      });
    header.addEventListener('click', toggle, { signal });
    header.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      },
      { signal }
    );
  }
}

function visitHeat(root, signal) {
  const days = window.__BOOT__?.visualDays;
  if (!Array.isArray(days) || !days.length) return;
  const values = dailyHeat(Object.fromEntries(days.map((day) => [day.date, day.pv])));
  const max = Math.max(1, ...values.map((day) => day.count));
  const card = make('section', 'card');
  card.append(make('h2', 'card__title', '近 30 天 · 访问热力'));
  const grid = make('div', 'pearl-heat');
  const detail = make('p', 'field__hint', '每格代表一天，颜色越深表示访问越多。');
  detail.setAttribute('aria-live', 'polite');
  values.forEach((day, i) => {
    const button = make('button');
    button.type = 'button';
    button.title = `${day.date} · ${day.count} 次访问`;
    button.setAttribute('aria-label', button.title);
    button.style.setProperty('--heat', `${Math.round((day.count / max) * 85 + 5)}%`);
    button.addEventListener('focus', () => (detail.textContent = button.title), { signal });
    button.addEventListener('pointerenter', () => (detail.textContent = button.title), { signal });
    grid.append(button);
    if (window.gsap && !motionOff())
      window.gsap.fromTo(
        button,
        { opacity: 0, scale: 0.7 },
        {
          opacity: 1,
          scale: 1,
          duration: 0.45,
          delay: ((i % 7) + Math.floor(i / 7)) * 0.035,
          ease: 'expo.out',
          clearProps: 'opacity,transform',
        }
      );
  });
  card.append(grid, detail);
  root.querySelectorAll(':scope > .card')[1]?.after(card);
}

function navGalaxy(root, signal, segmented) {
  const cats = [...root.querySelectorAll('.navcat')];
  if (!cats.length) return;
  const list = cats[0].parentElement;
  if (!list) return;
  const toolbar = make('div', 'pearl-table-tools'),
    scene = make('div', '');
  scene.hidden = true;
  let built = false;
  const choose = (value) => {
    list.hidden = value === 'graph';
    scene.hidden = value !== 'graph';
    if (value === 'graph' && !built) {
      const groups = cats.map((cat, i) => ({
        id: `group:${i}`,
        label: cat.querySelector('.navcat__name')?.value || '未命名',
        count: cat.querySelectorAll('.navcat__link,.kv-row,.navlink').length,
      }));
      const items = [],
        links = [];
      for (const [i, cat] of cats.entries()) {
        const names = [...cat.querySelectorAll('input')].filter(
          (input) =>
            input !== cat.querySelector('.navcat__name') &&
            /名称|显示名|网站名|标题/.test(input.placeholder || input.getAttribute('aria-label') || '')
        );
        for (const input of names) {
          const id = `item:${items.length}`;
          items.push({
            id,
            title: input.value || '未命名链接',
            categories: [groups[i].label],
            href: '/admin/links',
          });
          links.push({ from: groups[i].id, to: id });
        }
        groups[i].count = items.filter((x) => x.categories[0] === groups[i].label).length;
      }
      relationStage(scene, { groups, items, links }, signal);
      built = true;
    }
  };
  toolbar.append(
    make('span', 'field__hint', '网址导航'),
    segmented(
      [
        { label: '编辑列表', value: 'list' },
        { label: '导航星图', value: 'graph' },
      ],
      'list',
      choose
    )
  );
  list.before(toolbar);
  list.after(scene);
}

export function initVisualizations(root, signal, segmented) {
  contentViews(root, signal, segmented);
  publishViews(root, signal);
  settingsSamples(root, signal);
  navGalaxy(root, signal, segmented);
  visitHeat(root, signal);
}
