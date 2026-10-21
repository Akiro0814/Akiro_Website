import { BlobKvDatabase, createHandler, scaffoldAdapters, FULL_CAPABILITIES } from '@twikoojs/common';
import { toTkRequest } from 'tkserver';

export const SNAPSHOT_COMMENT_EVENTS = new Set(['GET_CONFIG', 'GET_PASSWORD_STATUS', 'COMMENT_GET', 'GET_COMMENTS_COUNT', 'GET_RECENT_COMMENTS', 'COUNTER_GET']);

// 发布目录可能由静态服务器直接访问，只允许保存公开字段；投票身份转换为
// 无意义占位数组以兼容官方 DTO，原始邮箱、IP、uid 和后台桥接令牌绝不出库。
export function sanitizeComments(documents) {
  const hidden = new Set(documents.filter((c) => c.isSpam).map((c) => String(c._id)));
  const keys = ['_id', 'nick', 'avatar', 'mailMd5', 'url', 'href', 'link', 'comment', 'created', 'updated', 'rid', 'pid', 'master', 'top'];
  const votes = (value) => Array.from({ length: Math.min(10000, Array.isArray(value) ? value.length : Number(value) || 0) }, (_, i) => `published-vote-${i}`);
  return documents.filter((c) => !c.isSpam && !hidden.has(String(c.rid || '')))
    .map((c) => ({ ...Object.fromEntries(keys.filter((k) => c[k] !== undefined).map((k) => [k, c[k]])), ups: votes(c.ups ?? c.like), downs: votes(c.downs) }));
}

// 使用官方查询、分页和回复树逻辑；底层只读 KV 只持有已脱敏快照。
// COUNTER_GET 的隐式计数写入被丢弃，公开数值始终保持在发布取样时刻。
export function createPublishedComments(snapshot) {
  const data = structuredClone(snapshot);
  const database = new BlobKvDatabase({
    async get(key) {
      if (key === 'comments:all') return data.comments || [];
      if (key === 'config:main') return { ...data.config, HIDE_ADMIN_CRYPT: 'AKIRO_MANAGED_ADMIN_ONLY' };
      if (key.startsWith('counter:')) return data.counters?.find((c) => c.url === decodeURIComponent(key.slice(8))) || null;
      return null;
    },
    async setJSON() {}, async delete() {}, async list() { return { blobs: [] }; },
  });
  // 不允许 COUNTER_GET 通过返回值自增后再显示新值。
  database.incCounter = async (url) => data.counters?.find((c) => c.url === url) || { url, time: 0 };
  const handler = createHandler(scaffoldAdapters({
    database, capabilities: FULL_CAPABILITIES,
    request: { toTkRequest: (req) => req }, response: { fromTkResponse: (res) => res },
  }));
  return async (body) => {
    if (!SNAPSHOT_COMMENT_EVENTS.has(body.event)) return { status: 403, body: { code: 1000, message: '只读发布快照' } };
    const result = await handler(toTkRequest({ method: 'POST', url: '/', headers: {}, body: { ...body, accessToken: '' } }));
    delete result.body.log;
    return result;
  };
}
