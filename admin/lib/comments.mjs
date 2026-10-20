// 博客管理界面使用的 Twikoo 适配层：所有数据来自官方数据库/官方 API。
// 保留现有页面接口，避免评论管理与站点统计继续读取旧 comments.json。
import { marked } from 'marked';
import { dayKeyOf } from './stats.mjs';
import { twikoo, plainComment } from './twikoo.mjs';

const toAdmin = (item) => ({
  // 只下发页面真正需要的字段；官方 uid 可能是服务端桥接令牌，绝不能进入 boot JSON。
  id: String(item._id || item.id), nick: String(item.nick || ''), mail: String(item.mail || ''),
  url: String(item.url || ''), commentMd: item.commentMd || plainComment(item.comment),
  master: Boolean(item.master), ua: String(item.ua || ''),
  status: item.isSpam ? 'hidden' : 'visible', created: Number(item.created) || 0,
  like: (Array.isArray(item.ups) ? item.ups.length : Number(item.ups) || 0) + (Array.isArray(item.like) ? item.like.length : Number(item.like) || 0),
});
export async function adminList({ status, keyword = '' } = {}) {
  const key = String(keyword).toLowerCase().trim();
  return (await twikoo.documents()).map(toAdmin)
    .filter((item) => (!['visible', 'hidden'].includes(status) || item.status === status)
      && (!key || [item.nick, item.mail, item.url, item.commentMd].some((value) => String(value || '').toLowerCase().includes(key))))
    .sort((a, b) => b.created - a.created);
}
export async function adminCount() {
  const all = await adminList();
  return { total: all.length, visible: all.filter((item) => item.status === 'visible').length, hidden: all.filter((item) => item.status === 'hidden').length };
}
const managed = async (body) => {
  const result = await twikoo.adminCall(body);
  if (result.status >= 400 || result.body.code !== 0) throw Error(result.body.message || 'Twikoo 操作失败。');
  return { ok: true, ...result.body };
};
export async function adminSetStatus(id, status) {
  if (!['visible', 'hidden'].includes(status)) throw Error('状态无效');
  return managed({ event: 'COMMENT_SET_FOR_ADMIN', id, set: { isSpam: status === 'hidden' } });
}
export async function adminRemove(id) {
  const all = await twikoo.documents();
  if (!all.some((item) => String(item._id || item.id) === id)) throw Error('评论不存在');
  // 删除主楼时一起删除回复，避免留下无法从前台找到的孤立评论。
  for (const item of all.filter((item) => item.rid === id)) await managed({ event: 'COMMENT_DELETE_FOR_ADMIN', id: String(item._id || item.id) });
  return managed({ event: 'COMMENT_DELETE_FOR_ADMIN', id });
}
export async function adminReply({ id, comment, nick }) {
  const text = String(comment || '').trim();
  if (!text || text.length > 5000) throw Error('请填写不超过 5000 字的回复。');
  const parent = (await twikoo.documents()).find((item) => String(item._id || item.id) === id);
  if (!parent) throw Error('评论不存在');
  const config = await twikoo.adminCall({ event: 'GET_CONFIG_FOR_ADMIN' });
  return managed({ event: 'COMMENT_SUBMIT', url: parent.url, href: parent.href || parent.url,
    rid: parent.rid || id, pid: id, nick: nick || process.env.ADMIN_USER || 'Akiro',
    mail: config.body.config?.BLOGGER_EMAIL || 'blogger@localhost.invalid',
    comment: String(marked.parse(text, { async: false })), ua: 'Akiro admin' });
}
export async function adminTrend({ daysLimit = 30, monthsLimit = 12, recentLimit = 5 } = {}) {
  const all = await adminList();
  const byDay = {};
  const byMonth = {};
  for (const comment of all) {
    const day = dayKeyOf(comment.created);
    byDay[day] = (byDay[day] || 0) + 1;
    byMonth[day.slice(0, 7)] = (byMonth[day.slice(0, 7)] || 0) + 1;
  }
  const days = Array.from({ length: daysLimit }, (_, i) => {
    const date = dayKeyOf(Date.now() - (daysLimit - 1 - i) * 86400000);
    return { date, count: byDay[date] || 0 };
  });
  const now = new Date(Date.now() + 8 * 3600000);
  const months = Array.from({ length: monthsLimit }, (_, i) => {
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsLimit + 1 + i, 1)).toISOString().slice(0, 7);
    return { month, count: byMonth[month] || 0 };
  });
  const recent = all.slice(0, recentLimit).map((item) => ({ ...item, excerpt: item.commentMd.slice(0, 60) }));
  return { days, months, recent };
}
