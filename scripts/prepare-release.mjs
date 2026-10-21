// 只在已冻结的构建副本中执行；运行库、鉴权、备份数据不会复制到 dist。
import fs from 'node:fs';
import path from 'node:path';
import * as site from '../admin/lib/site-data.mjs';
import * as music from '../admin/lib/music.mjs';
import * as projects from '../admin/lib/projects.mjs';
import { projectCatalog } from '../admin/lib/project-catalog.mjs';
import { readJSON } from '../admin/lib/store.mjs';
import { ROOT } from '../admin/lib/env.mjs';
import { readWallpapers } from '../src/lib/wallpapers.mjs';
import { buildMediaReferenceIndex } from '../admin/lib/media-references.mjs';

const comments = readJSON('published-comments.json', { comments: [], config: {}, counters: [] });
const friends = site.getFriends();
const stats = readJSON('stats.json', {});
const day = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const today = stats.days?.[day];
const tracks = await music.publicPlaylist();
const state = {
  version: 1, capturedAt: new Date().toISOString(),
  mediaReferences: buildMediaReferenceIndex(),
  profile: site.getProfile(), nav: site.getNavLinks(),
  friends: { notice: friends.notice, items: friends.items.filter((f) => f.status === 'approved')
    .map(({ id, name, url, avatar, desc }) => ({ id, name, url, avatar, desc })) },
  announcements: site.activeAnnouncements(),
  projects: projects.listProjects().map((p) => ({ ...p, contentHtml: projects.renderProjectContent(p.content) })),
  catalog: await projectCatalog.read(),
  wallpapers: readWallpapers(ROOT),
  tracks: tracks.map(({ id, source, title, artist, cover, fileName, neteaseId, url }) => ({ id, source, title, artist, cover, fileName, neteaseId, url })),
  comments,
  stats: { since: site.getSiteMeta().since, comments: comments.comments.length,
    totalViews: Number(stats.total) || 0, todayViews: Number(typeof today === 'number' ? today : today?.pv ?? today?.count) || 0 },
};
fs.writeFileSync(path.join(ROOT, 'data/release-state.json'), JSON.stringify(state));
