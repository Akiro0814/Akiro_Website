// 动态模块的 HTTP 路由：公开接口（前台访客用）与管理接口（后台登录后用）。
// 由 server.mjs 挂载；公开接口全部带限流，管理接口走 session + CSRF。
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { rateLimit, MUSIC_FILES_DIR } from './store.mjs';
import * as comments from './comments.mjs';
import { commentService } from './comment-service.mjs';
import * as siteData from './site-data.mjs';
import * as music from './music.mjs';
import * as projects from './projects.mjs';
import * as projectAI from './project-ai.mjs';
import * as stats from './stats.mjs';
import { publishedPostCount } from './published-content.mjs';
import { readPublishedState, publishedRoot } from './published-state.mjs';
import { ROOT } from './env.mjs';
import { readWallpapers } from '../../src/lib/wallpapers.mjs';

const jsonError = (res, err, fallback = '操作失败') =>
  res.status(400).json({ error: err?.message || fallback });

// 后台「站点数据」页的实时聚合；公开接口单独读取已发布统计快照。
// 总文章量只计已发布的文章（草稿不计），与前台归档页的「N 篇文章」一致；
// 总评论量为系统内全部评论（含回复）。
export async function siteStats() {
  const s = stats.summary();
  return {
    since: siteData.getSiteMeta().since,
    posts: publishedPostCount(),
    comments: await commentService.visibleCount(),
    totalViews: s.total,
    todayViews: s.today,
  };
}

// ============================ 公开接口 ============================
export function publicRouter() {
  const router = express.Router();
  // 页面内容固定本次响应的 release；评论独立走实时数据库，不随静态版本回滚。
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    req.publishedRoot = publishedRoot();
    req.published = readPublishedState(req.publishedRoot);
    next();
  });
  router.get('/project-catalog', async (req,res) => {
    if(!rateLimit(req,{key:'projects',max:120,windowMs:300_000}).ok) return res.status(429).json({error:'请求过于频繁'});
    try { if (!req.published) return res.status(503).json({error:'请先完成一次构建发布。'}); res.json(req.published.catalog);}
    catch {res.status(503).json({error:'项目同步暂不可用，请稍后再试。'});}
  });

  // 公开壁纸清单只读取发布快照。后台预览通过独立鉴权入口读取源目录。
  router.get('/wallpapers', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ items: req.published?.wallpapers || [] });
  });
  // 图片走已有 /api 反代，仅返回清单所属发布版本的文件。
  router.get('/wallpapers/:filename', (req, res) => {
    const name = req.params.filename;
    const url = `/wallpapers/${encodeURIComponent(name)}`;
    if (!req.published?.wallpapers?.includes(url) || path.basename(name) !== name) return res.status(404).end();
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(req.publishedRoot, 'wallpapers', name));
  });

  // 独立评论查询与短时挑战不依赖文章是否已构建发布。
  router.get('/comments', async (req, res) => {
    if (!rateLimit(req, { key: 'comment-read', max: 300, windowMs: 300000 }).ok) return res.status(429).json({ error: '读取过于频繁。' });
    try { res.json(await commentService.list(req.query)); } catch (error) { jsonError(res, error); }
  });
  router.get('/comments/challenge', (req, res) => res.json(commentService.challenge({ ip: req.ip })));
  router.post('/comments', async (req, res) => {
    // 按事件分桶限流：浏览（GET）宽松——每次打开文章/随笔页都算一次读，
    // 若与发送共用一个桶，刷新十来次后连看都看不了；发送与点赞各自限额防刷。
    const event = req.body?.action === 'like' ? 'COMMENT_LIKE' : 'COMMENT_SUBMIT';
    const limitFor =
      event === 'COMMENT_GET' || event.startsWith('GET_') || event === 'COUNTER_GET'
        ? { key: 'comment-read', max: 300, windowMs: 5 * 60 * 1000 }
        : event === 'COMMENT_LIKE'
          ? { key: 'comment-like', max: 30, windowMs: 5 * 60 * 1000 }
          : { key: 'comment-write', max: 10, windowMs: 5 * 60 * 1000 };
    const limit = rateLimit(req, limitFor);
    if (!limit.ok) {
      return res.status(429).json({ error: `操作过于频繁，请 ${limit.retryAfter} 秒后再试。` });
    }
    const body = req.body || {};
    try {
      const origin = req.get('origin');
      const allowed = new Set([`${req.protocol}://${req.get('host')}`, process.env.SITE_URL].filter(Boolean));
      // 同源网关经开发反代后 Host 可能变为后台端口；浏览器的 Fetch Metadata
      // 仍描述访客实际发起请求的站点关系，不信任任意 forwarded-host。
      if (origin && !allowed.has(origin) && req.get('sec-fetch-site') !== 'same-origin') return res.status(403).json({ error: '请从本站提交评论。' });
      const context = { ip: req.ip, ua: req.get('user-agent'), hints: body.hints || {} };
      if (body.website || !commentService.verifyChallenge(body.token, context)) return res.status(400).json({ error: '请稍候再提交，或刷新验证码。' });
      const result = body.action === 'like' ? await commentService.like(body.id, context) : await commentService.submit(body, context);
      return res.json(result);
    } catch (err) {
      return jsonError(res, err);
    }
  });

  // —— 友链 ——
  router.get('/friends', (req, res) => {
    const data = req.published?.friends || { notice: '', items: [] };
    res.json({
      notice: data.notice,
      // 前台只展示已通过审核的友链。
      items: data.items,
    });
  });

  router.post('/friends/apply', async (req, res) => {
    const limit = rateLimit(req, { key: 'friend-apply', max: 5, windowMs: 30 * 60 * 1000 });
    if (!limit.ok) {
      return res.status(429).json({ error: `提交过于频繁，请 ${limit.retryAfter} 秒后再试。` });
    }
    try {
      await siteData.applyFriend(req.body || {});
      res.json({ ok: true, message: '申请已提交，审核通过并构建发布后将展示在友链页。' });
    } catch (err) {
      return jsonError(res, err);
    }
  });

  // —— 公告 ——
  router.get('/announcements', (req, res) => {
    res.json({ items: req.published?.announcements || [] });
  });

  // —— 项目 ——
  router.get('/projects', (req, res) => {
    res.json({ items: req.published?.projects || [] });
  });
  router.get('/projects/:slug', (req, res) => {
    const project = req.published?.projects?.find((p) => p.slug === req.params.slug);
    if (!project) return res.status(404).json({ error: '项目不存在' });
    res.json({
      project,
    });
  });

  // —— 歌单 ——
  router.get('/playlist', async (req, res) => {
    const limit = rateLimit(req, { key: 'playlist', max: 60, windowMs: 60 * 1000 });
    if (!limit.ok) return res.status(429).json({ error: '请求过于频繁' });
    try {
      res.json({ tracks: req.published?.tracks || [] });
    } catch (err) {
      jsonError(res, err, '歌单加载失败');
    }
  });

  // 网易云曲目播放地址刷新（播放失败后前端重新解析）。
  router.get('/playlist/resolve/:id', async (req, res) => {
    const limit = rateLimit(req, { key: 'resolve', max: 30, windowMs: 60 * 1000 });
    if (!limit.ok) return res.status(429).json({ error: '请求过于频繁' });
    if (!req.published?.tracks?.some((t) => t.neteaseId === req.params.id)) return res.status(404).json({ error: '歌曲尚未发布' });
    try {
      const url = await music.resolvePlayUrl(req.params.id, { refresh: true });
      res.json({ url });
    } catch (err) {
      jsonError(res, err, '解析播放地址失败');
    }
  });

  // 歌词（LRC 文本）：经服务端转发获取，前端解析展示。
  router.get('/playlist/lyric/:id', async (req, res) => {
    const limit = rateLimit(req, { key: 'lyric', max: 60, windowMs: 60 * 1000 });
    if (!limit.ok) return res.status(429).json({ error: '请求过于频繁' });
    if (!req.published?.tracks?.some((t) => t.neteaseId === req.params.id)) return res.status(404).json({ error: '歌曲尚未发布' });
    try {
      res.json({ lyric: await music.getLyric(req.params.id) });
    } catch (err) {
      jsonError(res, err, '歌词获取失败');
    }
  });

  // —— 访问统计打点 ——
  router.post('/view', async (req, res) => {
    const limit = rateLimit(req, { key: 'view', max: 120, windowMs: 60 * 1000 });
    if (!limit.ok) return res.status(202).json({ ok: true }); // 打点失败静默，不影响浏览
    try {
      const { path: p, title, ref, ua } = req.body || {};
      await stats.recordView({ path: p, title, ip: req.ip, ref, ua, host: req.get('host') });
      res.json({ ok: true });
    } catch {
      res.json({ ok: true });
    }
  });

  // —— 站点信息聚合（前端少发请求） ——
  router.get('/site-info', (req, res) => {
    res.json({
      profile: req.published?.profile || {},
      nav: req.published?.nav || {},
      announcements: req.published?.announcements || [],
    });
  });

  // —— 站点数据（前台「网站数据」模块：运行时间 / 文章 / 评论 / 访问量） ——
  router.get('/site-stats', async (req, res) => {
    const limit = rateLimit(req, { key: 'site-stats', max: 60, windowMs: 60 * 1000 });
    if (!limit.ok) return res.status(429).json({ error: '请求过于频繁，请稍后再试。' });
    try {
      // 文章和访问统计维持发布语义；评论数量与实时列表及后台审核状态保持一致。
      const count = await commentService.visibleCount();
      res.json({ ...(req.published?.stats || { since: '', posts: publishedPostCount(), totalViews: 0, todayViews: 0 }), comments: count });
    } catch (err) { jsonError(res, err, '评论统计暂不可用'); }
  });

  return router;
}

// ============================ 管理接口 ============================
export function manageRouter({ requireApiAuth, requireCsrf }) {
  const router = express.Router();
  router.use(requireApiAuth);
  // 后台目录预览与公开快照分离，添加图片后可先检查，再统一构建发布。
  router.get('/wallpapers', (_req, res) => res.set('Cache-Control', 'no-store').json({ items: readWallpapers(ROOT) }));
  router.get('/wallpapers/:filename', (req, res) => {
    const name = req.params.filename;
    if (path.basename(name) !== name || !readWallpapers(ROOT).includes(`/wallpapers/${encodeURIComponent(name)}`)) return res.status(404).end();
    res.set('Cache-Control', 'no-store').sendFile(path.join(ROOT, 'public/wallpapers', name));
  });

  // —— 页面内容（主页 hero + 关于页） ——
  router.get('/profile', (_req, res) => res.json({ profile: siteData.getProfile() }));
  router.post('/profile', requireCsrf, async (req, res) => {
    try {
      res.json({ ok: true, profile: await siteData.saveProfile(req.body?.profile || {}), message: '页面内容已保存。' });
    } catch (err) {
      jsonError(res, err);
    }
  });

  // —— 网址导航 ——
  router.get('/nav', (_req, res) => res.json({ nav: siteData.getNavLinks() }));
  router.post('/nav', requireCsrf, async (req, res) => {
    try {
      res.json({ ok: true, nav: await siteData.saveNavLinks(req.body?.nav || {}), message: '导航已保存。' });
    } catch (err) {
      jsonError(res, err);
    }
  });

  // —— 友链管理 ——
  router.get('/friends', (_req, res) => res.json(siteData.getFriends()));
  router.post('/friends/notice', requireCsrf, async (req, res) => {
    try {
      // 先等待写入完成再读取 notice，避免对 Promise 取属性而提前返回成功。
      res.json({ ok: true, notice: (await siteData.saveFriendsNotice(req.body?.notice)).notice, message: '申请须知已保存。' });
    } catch (err) {
      jsonError(res, err);
    }
  });
  router.post('/friends/save', requireCsrf, async (req, res) => {
    try {
      res.json({ ok: true, item: await siteData.saveFriend(req.body || {}), message: '友链已保存。' });
    } catch (err) {
      jsonError(res, err);
    }
  });
  router.post('/friends/review', requireCsrf, async (req, res) => {
    try {
      const item = await siteData.reviewFriend(req.body?.id, req.body?.status);
      const label = item.status === 'approved' ? '已通过，构建发布后展示' : item.status === 'rejected' ? '已拒绝，构建发布后同步前台' : '已重置为待审核，构建发布后同步前台';
      res.json({ ok: true, item, message: label });
    } catch (err) {
      jsonError(res, err);
    }
  });
  router.post('/friends/delete', requireCsrf, async (req, res) => {
    try {
      res.json({ ...(await siteData.deleteFriend(req.body?.id)), message: '友链已删除。' });
    } catch (err) {
      jsonError(res, err);
    }
  });

  // —— 项目管理 ——
  router.get('/projects', (_req, res) => res.json({ items: projects.listProjects() }));
  // AI 配置与调用只存在于鉴权管理路由，写入和付费请求均验证 CSRF。
  router.get('/projects/ai/config', (_req, res) => res.set('Cache-Control', 'no-store').json(projectAI.projectAIStatus()));
  router.post('/projects/ai/config', requireCsrf, (req, res) => {
    try { res.set('Cache-Control', 'no-store').json(projectAI.saveProjectAIKey(req.body?.apiKey)); }
    catch (err) { jsonError(res, err); }
  });
  router.post('/projects/ai/analyze', requireCsrf, async (req, res) => {
    if (!rateLimit(req, { key: 'project-ai', max: 5, windowMs: 300000 }).ok) return res.status(429).json({ error: '分析请求过于频繁，请稍后再试' });
    try { res.set('Cache-Control', 'no-store').json({ draft: await projectAI.analyzeProjectRepository(req.body?.repositoryUrl) }); }
    catch (err) { jsonError(res, err); }
  });
  router.post('/projects/save', requireCsrf, (req, res) => {
    try {
      const entry = projects.saveProject(req.body || {});
      res.json({ ok: true, project: entry, message: '项目已保存。' });
    } catch (err) {
      jsonError(res, err);
    }
  });
  router.post('/projects/delete', requireCsrf, (req, res) => {
    try {
      res.json({ ...projects.deleteProject(req.body?.id), message: '项目已删除。' });
    } catch (err) {
      jsonError(res, err);
    }
  });

  // —— 音乐管理 ——
  router.get('/music', (_req, res) => res.json({ tracks: music.listTracks() }));
  router.get('/music/resolve/:id', async (req, res) => {
    if (!music.listTracks().some((track) => track.neteaseId === req.params.id)) return res.status(404).json({ error: '歌曲不存在' });
    try { res.json({ url: await music.resolvePlayUrl(req.params.id, { refresh: true }) }); }
    catch (err) { jsonError(res, err, '试听地址解析失败'); }
  });
  router.post('/music/upload', requireCsrf, express.raw({ type: () => true, limit: '30mb' }), (req, res) => {
    try {
      const query = req.query || {};
      const track = music.addLocalTrack({
        buffer: req.body,
        originalName: String(query.filename || 'track.mp3'),
        title: String(query.title || ''),
        artist: String(query.artist || ''),
        cover: String(query.cover || ''),
      });
      res.json({ ok: true, track, message: '音频已上传并加入歌单。' });
    } catch (err) {
      jsonError(res, err);
    }
  });
  router.post('/music/import-netease', requireCsrf, async (req, res) => {
    try {
      const result = await music.importNetease(req.body?.input || '', {
        type: req.body?.type === 'playlist' || req.body?.type === 'song' ? req.body.type : undefined,
      });
      res.json({
        ok: true,
        ...result,
        message:
          result.message ||
          (result.playlist ? `已导入 ${result.tracks.length} 首歌曲。` : '已加入歌单。'),
      });
    } catch (err) {
      jsonError(res, err, '网易云导入失败');
    }
  });
  router.post('/music/update', requireCsrf, (req, res) => {
    try {
      res.json({ ok: true, track: music.updateTrack(req.body?.id, req.body || {}), message: '曲目已更新。' });
    } catch (err) {
      jsonError(res, err);
    }
  });
  router.post('/music/delete', requireCsrf, (req, res) => {
    try {
      res.json({ ...music.removeTrack(req.body?.id), message: '曲目已删除。' });
    } catch (err) {
      jsonError(res, err);
    }
  });
  router.post('/music/reorder', requireCsrf, (req, res) => {
    try {
      res.json({ ...music.reorderTracks(req.body?.ids), message: '顺序已保存。' });
    } catch (err) {
      jsonError(res, err);
    }
  });

  // —— 公告管理 ——
  router.get('/announcements', (_req, res) => res.json({ items: siteData.getAnnouncements() }));
  router.post('/announcements/save', requireCsrf, async (req, res) => {
    try {
      const entry = await siteData.saveAnnouncement(req.body || {});
      res.json({ ok: true, item: entry, message: '公告已保存。' });
    } catch (err) {
      jsonError(res, err);
    }
  });
  router.post('/announcements/delete', requireCsrf, async (req, res) => {
    try {
      res.json({ ...(await siteData.deleteAnnouncement(req.body?.id)), message: '公告已删除。' });
    } catch (err) {
      jsonError(res, err);
    }
  });

  // —— 评论管理 ——
  router.get('/comments', async (req, res) => {
    try { res.json({ items: await comments.adminList({ status: req.query.status, keyword: req.query.keyword }), counts: await comments.adminCount() }); }
    catch (error) { jsonError(res, error); }
  });
  router.get('/comments/settings', async (_req, res) => {
    try { res.json({ settings: await commentService.settings(), health: await commentService.health() }); } catch (error) { jsonError(res, error); }
  });
  router.post('/comments/settings', requireCsrf, async (req, res) => {
    try { res.json({ ok: true, settings: await commentService.saveSettings(req.body || {}) }); } catch (error) { jsonError(res, error); }
  });
  router.get('/comments/export', async (_req, res) => {
    try { res.attachment('akiro-comments.json').json(await commentService.export()); } catch (error) { jsonError(res, error); }
  });
  router.get('/comments/notifications', async (_req, res) => {
    try { res.json(await commentService.notificationSettings()); } catch (error) { jsonError(res, error); }
  });
  router.post('/comments/notifications', requireCsrf, async (req, res) => {
    try { res.json(await commentService.saveNotificationSettings(req.body || {})); } catch (error) { jsonError(res, error); }
  });
  router.post('/comments/import', requireCsrf, async (req, res) => {
    try { res.json(await commentService.import(req.body)); } catch (error) { jsonError(res, error); }
  });
  router.post('/comments/status', requireCsrf, async (req, res) => {
    try {
      res.json({ ...(await comments.adminSetStatus(req.body?.id, req.body?.status)), message: '评论状态已更新。' });
    } catch (err) {
      jsonError(res, err);
    }
  });
  router.post('/comments/delete', requireCsrf, async (req, res) => {
    try {
      res.json({ ...(await comments.adminRemove(req.body?.id)), message: '评论已删除。' });
    } catch (err) {
      jsonError(res, err);
    }
  });
  router.post('/comments/reply', requireCsrf, async (req, res) => {
    try {
      const result = await comments.adminReply({
        id: req.body?.id,
        comment: req.body?.comment,
        nick: req.body?.nick,
      });
      res.json({ ok: true, ...result, message: '回复已发布，前台即时可见。' });
    } catch (err) {
      jsonError(res, err);
    }
  });

  // —— 访问统计 ——
  router.get('/stats', (_req, res) => res.json(stats.summary({ pathsLimit: 50, regionsLimit: 50 })));

  // —— 站点数据（开站日期） ——
  router.get('/site-meta', (_req, res) => res.json({ meta: siteData.getSiteMeta() }));
  router.post('/site-meta', requireCsrf, async (req, res) => {
    try {
      res.json({ ok: true, meta: await siteData.saveSiteMeta(req.body || {}), message: '开站日期已保存，构建发布后生效。' });
    } catch (err) {
      jsonError(res, err);
    }
  });

  return router;
}

// 本地音频流式输出：支持 Range（拖动进度条需要），缓存一天。
export function musicFilesRouter({ preview = false } = {}) {
  const router = express.Router();
  router.get('/file/:name', (req, res) => {
    const name = path.basename(String(req.params.name || ''));
    const root = preview ? MUSIC_FILES_DIR : publishedRoot();
    if (!root || name !== String(req.params.name || '')) return res.status(404).end();
    const file = preview ? path.join(root, name) : path.join(root, '_published/music', name);
    if (!name || name.startsWith('.') || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      return res.status(404).json({ error: '音频不存在' });
    }
    const ext = path.extname(file).toLowerCase();
    const types = {
      '.mp3': 'audio/mpeg',
      '.flac': 'audio/flac',
      '.wav': 'audio/wav',
      '.m4a': 'audio/mp4',
      '.aac': 'audio/aac',
      '.ogg': 'audio/ogg',
    };
    res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', preview ? 'no-store' : 'no-cache');
    // 音频来自已发布副本或鉴权预览目录，手动支持单段 Range。
    const { size } = fs.statSync(file);
    const range = req.headers.range;
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      const start = match && match[1] ? Number(match[1]) : 0;
      const end = match && match[2] ? Number(match[2]) : size - 1;
      if (start >= size || end >= size || start > end) {
        res.setHeader('Content-Range', `bytes */${size}`);
        return res.status(416).end();
      }
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Length', end - start + 1);
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', size);
    return fs.createReadStream(file).pipe(res);
  });
  return router;
}
