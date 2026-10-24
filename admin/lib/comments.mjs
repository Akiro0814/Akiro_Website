// 评论管理复用独立服务，状态变更即时生效。
import { dayKeyOf } from './stats.mjs';
import { commentService } from './comment-service.mjs';
import { commentDevice } from './comment-device.mjs';
import { displayCommentUrl } from './comment-url.mjs';
export async function adminList({ status, keyword = '' } = {}) {
  const key = String(keyword).toLowerCase().trim();
  return (await commentService.documents()).map(c => ({ id: c._id, nick: c.nick, mail: c.mail,
    url: c.url, commentMd: c.commentMd, master: c.master, device: c.device || commentDevice(c.ua),
    status: c.isSpam ? 'hidden' : 'visible', created: c.created, like: c.baseLikes + c.votes.length }))
    .filter(c => (!['hidden', 'visible'].includes(status) || c.status === status) && (!key || [c.nick, c.mail, c.url, displayCommentUrl(c.url), c.commentMd].some(v => String(v).toLowerCase().includes(key))))
    .sort((a, b) => b.created - a.created);
}
export async function adminCount() { const all = await adminList(); return { total: all.length, visible: all.filter(c => c.status === 'visible').length, hidden: all.filter(c => c.status === 'hidden').length }; }
export const adminSetStatus = (id, status) => commentService.setStatus(id, status);
export const adminRemove = id => commentService.remove(id);
export const adminReply = body => commentService.reply(body);
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
