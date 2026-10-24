// 独立评论服务：单进程写队列 + 原子替换；与静态发布、回滚互不影响。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR } from './store.mjs';
import { writeFileAtomic } from './atomic-file.mjs';
import { normalizeComment, readLegacyComments, renderComment } from './comment-migration.mjs';
import { commentDevice } from './comment-device.mjs';
import { deliverCommentNotifications } from './comment-notifications.mjs';
import { effectiveNotificationConfig, maskedNotificationConfig, updateNotificationConfig } from './comment-config.mjs';

const defaults = { enabled: true, showDevice: true, pageSize: 10, maxLength: 5000, placeholder: '留下你的想法，支持 Markdown…', notifyOwner: true, notifyReply: true };
const pathOf = (value) => {
  const raw = String(value || '');
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.length > 1000 || /[?#\s]/.test(raw)) throw Error('评论页面地址无效。');
  try { return encodeURI(decodeURI(raw)); } catch { throw Error('评论页面地址无效。'); }
};
export function createCommentService({ dataDir = DATA_DIR, secret = process.env.SESSION_SECRET || 'local-comment-secret', notify = deliverCommentNotifications } = {}) {
  const file = path.join(dataDir, 'comments-store.json');
  let queue = Promise.resolve();
  let notificationTask;
  const digest = value => crypto.createHmac('sha256', secret).update(value).digest('hex');
  const read = async () => {
    if (fs.existsSync(file)) {
      const state = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (state.version !== 1 || !Array.isArray(state.items) || !state.settings) throw Error('评论库损坏，已拒绝覆盖。');
      return state;
    }
    // 非本地 Twikoo 不应被静默当作空库；先导出再导入独立系统。
    if (process.env.TWIKOO_ENV_ID || process.env.PUBLIC_TWIKOO_ENV_ID || process.env.MONGODB_URI || process.env.MONGO_URL) throw Error('请先导出远程 Twikoo 评论，清除远程环境配置后导入独立评论系统。');
    const { items, config } = readLegacyComments(dataDir, process.env.TWIKOO_DATA || path.join(dataDir, 'twikoo'));
    const state = { version: 1, items, settings: { ...defaults }, notificationConfig: Object.fromEntries(Object.entries(config).filter(([k]) => /^(SMTP_|SENDER_|BLOGGER_EMAIL$|SITE_|PUSHOO_)/.test(k))),
      migration: { completedAt: Date.now(), count: items.length }, outbox: [] };
    // 用户本次明确要求设备展示，默认开启；不继承旧的隐藏 UA 开关。
    await writeFileAtomic(file, JSON.stringify(state, null, 2));
    return state;
  };
  const locked = task => { const result = queue.then(task); queue = result.catch(() => {}); return result; };
  const change = task => locked(async () => { const state = await read(); const result = await task(state); await writeFileAtomic(file, JSON.stringify(state, null, 2)); return result; });
  const load = () => locked(read);
  const visibleItems = state => {
    const all = new Map(state.items.map(c => [c._id, c]));
    return state.items.filter(c => { let item = c; const visited = new Set(); while (item) { if (item.isSpam || visited.has(item._id)) return false; visited.add(item._id); if (!item.pid) return true; item = all.get(item.pid); } return false; });
  };
  const dto = (c, settings) => ({ id: c._id, nick: c.nick, url: c.url, comment: c.comment,
    created: c.created, master: c.master, pid: c.pid, rid: c.rid, like: c.baseLikes + c.votes.length,
    ...(settings.showDevice && !c.master ? { device: c.device || commentDevice(c.ua) } : {}) });
  const settingsOf = state => ({ ...defaults, ...state.settings });
  const service = {
    async documents() { return structuredClone((await load()).items); },
    async visibleCount() { return visibleItems(await load()).length; },
    async settings() { return settingsOf(await load()); },
    async notificationSettings() { return maskedNotificationConfig(await load()); },
    async saveNotificationSettings(input) {
      return change(state => { updateNotificationConfig(state, input); return { ok: true, ...maskedNotificationConfig(state) }; });
    },
    async saveSettings(input) {
      return change(state => {
        const next = settingsOf(state);
        for (const key of ['enabled', 'showDevice', 'notifyOwner', 'notifyReply']) if (typeof input[key] === 'boolean') next[key] = input[key];
        for (const [key, min, max] of [['pageSize', 1, 50], ['maxLength', 10, 10000]]) if (input[key] !== undefined) {
          const n = Number(input[key]); if (!Number.isInteger(n) || n < min || n > max) throw Error('评论设置数值超出范围。'); next[key] = n;
        }
        if (input.placeholder !== undefined) next.placeholder = String(input.placeholder).slice(0, 200);
        state.settings = next; return next;
      });
    },
    async list({ url, page = 1, order = 'newest' }) {
      const state = await load(); const settings = settingsOf(state); const pathname = pathOf(url);
      const items = visibleItems(state).filter(c => pathOf(c.url) === pathname);
      const roots = items.filter(c => !c.pid).sort((a, b) => order === 'oldest' ? a.created - b.created : b.created - a.created);
      const pages = Math.max(1, Math.ceil(roots.length / settings.pageSize));
      const current = Math.min(pages, Math.max(1, Math.floor(Number(page) || 1)));
      return { items: roots.slice((current - 1) * settings.pageSize, current * settings.pageSize).map(c => ({ ...dto(c, settings),
        replies: items.filter(r => r.rid === c._id).sort((a, b) => a.created - b.created).map(r => dto(r, settings)) })),
      total: items.length, page: current, pages, settings };
    },
    async submit(body, context = {}, master = false) {
      const result = await change(state => {
        const settings = settingsOf(state); if (!settings.enabled && !master) throw Error('评论暂时关闭。');
        const text = String(body.comment || '').trim(); const nick = String(body.nick || '').trim();
        if (!text || text.length > settings.maxLength) throw Error(`请填写不超过 ${settings.maxLength} 字的评论。`);
        if (!nick || nick.length > 40) throw Error('昵称应为 1–40 字。');
        const mail = String(body.mail || '').trim().toLowerCase();
        if (mail && (mail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail))) throw Error('邮箱格式无效。');
        const url = pathOf(body.url); const pid = String(body.pid || '');
        const parent = pid ? (master ? state.items : visibleItems(state)).find(c => c._id === pid) : null;
        if (pid && (!parent || pathOf(parent.url) !== url)) throw Error('只能回复同一页面的可见评论。');
        const c = normalizeComment({ _id: crypto.randomUUID(), url, nick, mail, comment: renderComment(text), commentMd: text, master,
          ua: context.ua, device: commentDevice(context.ua, context.hints), pid, rid: parent ? parent.rid || parent._id : '', created: Date.now() });
        state.items.push(c);
        // 通知失败不影响提交；任务持久化后再异步发送，重启可继续。
        const recipients = { owner: !master && settings.notifyOwner, reply: settings.notifyReply ? parent?.mail || '' : '' };
        if (recipients.owner || recipients.reply) state.outbox.push({ id: crypto.randomUUID(), commentId: c._id, recipients, attempts: 0, due: Date.now() });
        return { ok: true, id: c._id };
      });
      service.flushNotifications().catch(() => {}); return result;
    },
    async reply({ id, comment, nick }) { const parent = (await load()).items.find(c => c._id === id); if (!parent) throw Error('评论不存在'); return service.submit({ url: parent.url, pid: id, comment, nick: nick || process.env.ADMIN_USER || 'Akiro' }, {}, true); },
    async setStatus(id, status) { return change(state => { if (!['visible', 'hidden'].includes(status)) throw Error('状态无效'); const c = state.items.find(c => c._id === id); if (!c) throw Error('评论不存在'); c.isSpam = status === 'hidden'; return { ok: true }; }); },
    async remove(id) { return change(state => { if (!state.items.some(c => c._id === id)) throw Error('评论不存在'); const deleted = new Set([id]); let count; do { count = deleted.size; for (const c of state.items) if (deleted.has(c.pid) || deleted.has(c.rid)) deleted.add(c._id); } while (deleted.size > count); state.items = state.items.filter(c => !deleted.has(c._id)); state.outbox = state.outbox.filter(job => !deleted.has(job.commentId)); return { ok: true }; }); },
    async like(id, context = {}) { return change(state => { const c = visibleItems(state).find(c => c._id === id); if (!c) throw Error('评论不存在'); const vote = digest(`${context.ip || ''}|${String(context.ua || '').slice(0, 512)}`); if (!c.votes.includes(vote)) c.votes.push(vote); return { ok: true, like: c.baseLikes + c.votes.length }; }); },
    async snapshot() { const state = await load(); return { comments: visibleItems(state).map(c => ({ ...dto(c, state.settings), _id: c._id, ups: c.baseLikes + c.votes.length })), config: {}, counters: [] }; },
    async export() { const state = await load(); return { version: 1, items: structuredClone(state.items), settings: settingsOf(state) }; },
    async import(input) {
      return change(state => {
        const source = Array.isArray(input) ? input : input.items;
        if (!Array.isArray(source) || source.length > 50000) throw Error('导入应为评论数组或本站导出 JSON。');
        const incoming = source.map(c => normalizeComment(c));
        const ids = new Set(state.items.map(c => c._id));
        const merged = new Map(state.items.map(c => [c._id, c]));
        for (const c of incoming) if (!merged.has(c._id)) merged.set(c._id, c);
        // 对新增记录逐层追溯，补齐根 ID，同时拒绝跨页、孤立和循环回复。
        for (const c of incoming.filter(item => !ids.has(item._id))) {
          const seen = new Set([c._id]); let parent = c;
          while (parent.pid) {
            if (seen.has(parent.pid)) throw Error('导入含循环回复。');
            seen.add(parent.pid); parent = merged.get(parent.pid);
            if (!parent || pathOf(parent.url) !== pathOf(c.url)) throw Error('导入含孤立或跨页面回复。');
          }
          c.rid = c.pid ? parent._id : '';
        }
        let added = 0;
        for (const c of incoming) if (!ids.has(c._id)) { state.items.push(c); ids.add(c._id); added++; }
        return { ok: true, added };
      });
    },
    challenge(context) { const payload = `${Date.now()}.${crypto.randomBytes(12).toString('hex')}`; return { token: `${payload}.${digest(`${payload}|${context.ip || ''}`)}`, minDelay: 800 }; },
    verifyChallenge(token, context) {
      const parts = String(token || '').split('.'); if (parts.length !== 3) return false;
      const [time, nonce, signature] = parts;
      if (!/^\d{13}$/.test(time) || !/^[a-f0-9]{24}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(signature)) return false;
      const age = Date.now() - Number(time); const expected = digest(`${time}.${nonce}|${context.ip || ''}`);
      return age >= 800 && age < 1800000 && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    },
    flushNotifications() {
      if (notificationTask) return notificationTask;
      notificationTask = (async () => { const state = await load(); for (const job of state.outbox.filter(j => j.attempts < 5 && j.due <= Date.now()).slice(0, 10)) {
        const comment = state.items.find(c => c._id === job.commentId); let ok = true;
        // 后台已编辑的字段优先于环境，其余沿用环境/迁移配置，密钥只留在服务端。
        const config = effectiveNotificationConfig(state);
        try { if (comment && visibleItems(state).some(c => c._id === comment._id)) await notify(comment, job.recipients, config); } catch { ok = false; }
        await change(current => { const saved = current.outbox.find(j => j.id === job.id); if (!saved) return; if (ok) current.outbox = current.outbox.filter(j => j.id !== job.id); else { saved.attempts++; saved.due = Date.now() + 60000 * 2 ** saved.attempts; } });
      }
      })().finally(() => { notificationTask = null; });
      return notificationTask;
    },
    async health() { const state = await load(); const config = effectiveNotificationConfig(state); return { migration: state.migration, pendingNotifications: state.outbox.length, smtpConfigured: Boolean((config.SMTP_HOST || config.SMTP_SERVICE) && config.SMTP_USER && config.SMTP_PASS), pushConfigured: Boolean(config.PUSHOO_CHANNEL === 'serverchan' && config.PUSHOO_TOKEN) }; },
    async close() { await notificationTask; await queue; },
  };
  return service;
}
export const commentService = createCommentService();
