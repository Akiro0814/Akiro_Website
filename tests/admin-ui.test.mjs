import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAppearance, filterCommands, contentGraph, dailyHeat } from '../admin/public/ui-model.js';

test('appearance accepts supported values and recovers from invalid saved settings', () => {
  assert.deepEqual(normalizeAppearance(null), { theme: 'auto', density: 'regular', collapsed: false });
  assert.deepEqual(normalizeAppearance({ theme: 'bad', density: 'wide', collapsed: 'false' }), {
    theme: 'auto',
    density: 'regular',
    collapsed: false,
  });
  assert.deepEqual(normalizeAppearance({ theme: 'dark', density: 'compact', collapsed: true }), {
    theme: 'dark',
    density: 'compact',
    collapsed: true,
  });
});

test('command search excludes external, login and malformed destinations', () => {
  const entries = [
    { label: '文章', href: '/admin/posts' },
    { label: '文章外链', href: 'https://example.org/admin' },
    { label: '登录', href: '/admin/login' },
    { label: '非法', href: '//example.org' },
  ];
  assert.deepEqual(filterCommands(entries, '文章'), [entries[0]]);
  assert.deepEqual(filterCommands(entries, ''), [entries[0]]);
});

test('content graph preserves real titles, unknown categories and stable edit destinations', () => {
  const graph = contentGraph(
    [
      {
        id: '技术/你好',
        data: { title: '<文章>', categories: ['技术', '笔记'], draft: true, date: '2026-10-13 08:00' },
      },
      { id: 'a', data: {} },
    ],
    'posts'
  );
  assert.equal(graph.items[0].title, '<文章>');
  assert.equal(graph.items[0].href, '/admin/posts/edit?path=%E6%8A%80%E6%9C%AF%2F%E4%BD%A0%E5%A5%BD');
  assert.equal(graph.items[0].draft, true);
  assert.equal(graph.items[0].date, '2026-10-13');
  assert.deepEqual(
    graph.groups.map((g) => g.label),
    ['技术', '笔记', '未分类']
  );
  assert.equal(graph.links.length, 3);
});

test('daily heat uses actual daily counts without inventing hourly activity', () => {
  assert.deepEqual(
    dailyHeat({ '2026-10-12': 3, '2026-10-13': { pv: 4 }, broken: 99, '2026-10-14': { count: 2 } }),
    [
      { date: '2026-10-12', count: 3 },
      { date: '2026-10-13', count: 4 },
      { date: '2026-10-14', count: 2 },
    ]
  );
});

test('invalid content dates stay out of the timeline without breaking the content views', () => {
  assert.equal(contentGraph([{ id: 'invalid', data: { date: '2026-99-99' } }]).items[0].date, '');
});
