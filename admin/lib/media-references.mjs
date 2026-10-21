import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './env.mjs';
import { DATA_DIR, readJSON } from './store.mjs';
import { COLLECTIONS, listEntries, listTrash } from './content.mjs';
import { readPublishedState } from './published-state.mjs';

const MODULES = [
  ['profile.json', '页面内容', '/admin/site-content'], ['projects.json', '项目', '/admin/projects'],
  ['nav.json', '导航', '/admin/links'], ['friends.json', '友链', '/admin/links'],
  ['announcements.json', '公告', '/admin/announcements'], ['music.json', '音乐', '/admin/music'],
];
const decode = (value) => String(value).replace(/(?:%[0-9a-f]{2})+/gi, (part) => { try { return decodeURIComponent(part); } catch { return part; } });
function references(value, name) {
  const text = decode(value), needle = `/uploads/${name}`;
  let pos = text.indexOf(needle);
  while (pos >= 0) {
    const after = text[pos + needle.length];
    if (!after || /[\s?#"'<>),\]}]/.test(after)) return true;
    pos = text.indexOf(needle, pos + needle.length);
  }
  return false;
}

// 以字段为单位返回来源，不把正文、邮箱或配置值放进引用结果。结构化递归
// 覆盖所有媒体字段，避免以后新增一个封面/图标字段却遗漏删除保护。
function scanMediaReferences(names, { includePublished = true, publishedOnly = false, commentDocuments = [], commentConfig = {} } = {}) {
  const index = Object.fromEntries(names.map((name) => [name, []]));
  const inspect = (value, location, field = '') => {
    if (typeof value === 'string') {
      for (const name of names) if (references(value, name)) index[name].push({ ...location, field: field || '正文' });
    } else if (value && typeof value === 'object') {
      if (!Array.isArray(value) && (value.title || value.name)) location = { ...location, title: String(value.title || value.name) };
      for (const [key, item] of Object.entries(value)) inspect(item, location, field ? `${field}.${key}` : key);
    }
  };
  for (const [collection, config] of Object.entries(COLLECTIONS)) {
    for (const entry of listEntries(collection)) {
      if (publishedOnly && entry.data.draft) continue;
      const location = { scope: 'pending', module: config.label, title: String(entry.data.title || entry.id),
        href: `/admin/${collection}/edit?path=${encodeURIComponent(entry.id)}` };
      inspect(entry.data, location);
      inspect(entry.body, location, '正文');
    }
    if (!publishedOnly) for (const item of listTrash(collection)) {
      const raw = fs.readFileSync(path.join(DATA_DIR, 'trash', collection, item.file), 'utf8');
      inspect(raw, { scope: 'trash', module: `${config.label}回收站`, title: String(item.title || item.id), href: `/admin/${collection}` }, '回收站正文与字段');
    }
  }
  for (const [file, module, href] of MODULES) {
    let data = readJSON(file, {});
    if (publishedOnly && file === 'friends.json') data = { ...data, items: data.items?.filter((i) => i.status === 'approved') };
    if (publishedOnly && file === 'music.json') data = { ...data, tracks: data.tracks?.filter((i) => i.enabled !== false) };
    if (publishedOnly && file === 'announcements.json' && Array.isArray(data)) data = data.filter((i) => i.enabled !== false && (!i.startAt || i.startAt <= Date.now()) && (!i.endAt || i.endAt >= Date.now()));
    inspect(data, { scope: 'pending', module, title: module, href });
  }
  let config = {};
  try { config = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/site.config.json'), 'utf8')); } catch {}
  inspect(config, { scope: 'pending', module: '站点配置', title: '站点配置', href: '/admin/site-content' });
  const comments = publishedOnly ? readJSON('published-comments.json', { comments: [], config: {} }) : { comments: commentDocuments, config: commentConfig };
  for (const comment of comments.comments) inspect(comment, { scope: 'pending', module: '评论', title: String(comment.nick || '读者评论'), href: '/admin/comments' });
  inspect(comments.config, { scope: 'pending', module: '评论配置', title: '评论配置', href: '/admin/twikoo' });
  if (includePublished) {
    const published = readPublishedState()?.mediaReferences || {};
    for (const name of names) index[name].push(...(published[name] || []));
  }
  return index;
}

export function findMediaReferences(name, options) {
  if (!name || path.basename(name) !== name || name.startsWith('.')) return [];
  return scanMediaReferences([name], options)[name];
}

export function buildMediaReferenceIndex() {
  const dir = path.join(ROOT, 'public/uploads');
  if (!fs.existsSync(dir)) return {};
  const names = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
  if (!names.length) return {};
  // 一次扫描全部内容，避免按每个媒体重新读取和解析整站 Markdown。
  const index = scanMediaReferences(names, { includePublished: false, publishedOnly: true });
  return Object.fromEntries(Object.entries(index).map(([name, refs]) => [name, refs.map((r) => ({ ...r, scope: 'published' }))]));
}
