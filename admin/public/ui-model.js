// UI-only models: no filesystem, credentials or server state.
export function normalizeAppearance(value) {
  const saved = value && typeof value === 'object' ? value : {};
  return {
    theme: ['light', 'dark', 'auto'].includes(saved.theme) ? saved.theme : 'auto',
    density: ['comfy', 'regular', 'compact'].includes(saved.density) ? saved.density : 'regular',
    collapsed: saved.collapsed === true,
  };
}

export function filterCommands(entries, keyword = '') {
  const query = String(keyword).trim().toLocaleLowerCase();
  return entries
    .filter((item) => /^\/admin(?:\/[\w-]+)*$/.test(item.href) && item.href !== '/admin/login')
    .filter((item) => `${item.label} ${item.group || ''}`.toLocaleLowerCase().includes(query));
}

export function contentGraph(entries, collection = 'posts') {
  const groups = new Map();
  const links = [];
  const items = entries.map((entry, index) => {
    const data = entry.data || {};
    const raw = Array.isArray(data.categories) ? data.categories : data.categories ? [data.categories] : [];
    const categories = [...new Set(raw.map(String).filter(Boolean))];
    const rawDate = String(data.date || '').slice(0, 10);
    const timestamp = Date.parse(`${rawDate}T00:00:00Z`);
    const date =
      Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === rawDate ? rawDate : '';
    if (!categories.length) categories.push('未分类');
    for (const label of categories) {
      if (!groups.has(label)) groups.set(label, { id: `group:${groups.size}`, label, count: 0 });
      const group = groups.get(label);
      group.count++;
      links.push({ from: group.id, to: `item:${index}` });
    }
    return {
      id: `item:${index}`,
      title: String(data.title || entry.id),
      categories,
      draft: !!data.draft,
      date,
      href: `/admin/${collection === 'notes' ? 'notes' : 'posts'}/edit?path=${encodeURIComponent(entry.id)}`,
    };
  });
  return { groups: [...groups.values()], items, links };
}

export function dailyHeat(days = {}) {
  return Object.entries(days)
    .filter(([date]) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .map(([date, value]) => ({
      date,
      count: Math.max(0, Number(typeof value === 'number' ? value : (value?.pv ?? value?.count)) || 0),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
