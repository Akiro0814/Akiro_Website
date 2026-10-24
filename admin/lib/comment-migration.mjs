// 迁移器只解析旧文件，不加载或启动旧评论服务。分片损坏必须中止，不能当作空库。
import fs from 'node:fs';
import path from 'node:path';
import sanitize from 'sanitize-html';
import { marked } from 'marked';

export const cleanComment = (html) => sanitize(String(html || ''), {
  allowedTags: ['p', 'br', 'a', 'strong', 'em', 'del', 'blockquote', 'code', 'pre', 'ul', 'ol', 'li', 'img'],
  allowedAttributes: { a: ['href', 'title', 'rel', 'target'], img: ['src', 'alt', 'title', 'loading', 'referrerpolicy'] },
  allowedSchemes: ['https', 'http'], allowProtocolRelative: false,
  transformTags: { a: sanitize.simpleTransform('a', { rel: 'nofollow noopener noreferrer', target: '_blank' }), img: sanitize.simpleTransform('img', { loading: 'lazy', referrerpolicy: 'no-referrer' }) },
});
export const renderComment = (text) => cleanComment(marked.parse(String(text || ''), { async: false, breaks: true }));
export const plainComment = (text) => sanitize(String(text || ''), { allowedTags: [], allowedAttributes: {} }).trim();

export function normalizeComment(c, legacy = false) {
  const id = String(c._id || c.id || '');
  if (!id || !c.url) throw Error('评论导入记录缺少 ID 或页面地址。');
  return { _id: id, url: String(c.url), nick: String(c.nick || '匿名').slice(0, 40), mail: String(c.mail || ''),
    comment: cleanComment(c.comment || renderComment(c.commentMd)), commentMd: String(c.commentMd || plainComment(c.comment)),
    created: Number(c.created) || Date.now(), updated: Number(c.updated || c.created) || Date.now(),
    rid: String(legacy ? c.pid || '' : c.rid || ''), pid: String(legacy ? c.rid || c.pid || '' : c.pid || ''),
    master: Boolean(c.master), isSpam: Boolean(c.isSpam || c.status === 'hidden'), ua: String(c.ua || '').slice(0, 512),
    // 原投票身份不继承；只保留数量，本站新点赞以加盐摘要去重。
    baseLikes: Math.min(10000, Math.max(0, Number(c.baseLikes ?? (Array.isArray(c.ups) ? c.ups.length : c.ups) ?? (Array.isArray(c.like) ? c.like.length : c.like)) || 0)),
    votes: Array.isArray(c.votes) ? c.votes.filter(v => typeof v === 'string') : [],
    ...(c.device ? { device: { os: String(c.device.os || '未知系统').slice(0, 80), browser: String(c.device.browser || '未知浏览器').slice(0, 80) } } : {}),
  };
}

export function readLegacyComments(dataDir, legacyDir = path.join(dataDir, 'twikoo')) {
  const dir = path.resolve(legacyDir);
  const file = path.join(dir, 'db.json');
  let documents = []; let config = {};
  if (fs.existsSync(file)) {
    const meta = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(meta.collections)) throw Error('旧评论库格式无效，迁移已中止。');
    const partitioned = meta.collections.some((_collection, i) => fs.existsSync(`${file}.${i}`));
    meta.collections.forEach((collection, i) => {
      const partition = `${file}.${i}`;
      if (partitioned && !fs.existsSync(partition)) throw Error('旧评论库分片缺失，迁移已中止。');
      const records = fs.existsSync(partition)
        ? fs.readFileSync(partition, 'utf8').split(/\r?\n/).filter(line => line.trim() && line.trim() !== '$<').map(line => JSON.parse(line))
        : collection.data;
      if (!Array.isArray(records)) throw Error('旧评论库分片缺失，迁移已中止。');
      if (collection.name === 'comment') documents = records;
      if (collection.name === 'config') config = records[0] || {};
    });
  }
  const items = new Map(documents.map(c => { const record = normalizeComment(c); return [record._id, record]; }));
  const legacyFile = path.join(dataDir, 'comments.json');
  if (fs.existsSync(legacyFile) && !config.AKIRO_LEGACY_IMPORTED) {
    const old = JSON.parse(fs.readFileSync(legacyFile, 'utf8'));
    if (!Array.isArray(old)) throw Error('旧评论 JSON 格式无效。');
    for (const c of old) { const record = normalizeComment(c, true); if (!items.has(record._id)) items.set(record._id, record); }
  }
  const backup = path.join(dataDir, 'comment-migration-backup');
  // 成功解析全部记录后才备份；源文件不写回、不删除。
  if (fs.existsSync(file) || fs.existsSync(legacyFile)) {
    fs.mkdirSync(backup, { recursive: true });
    if (fs.existsSync(file) && !fs.existsSync(path.join(backup, 'twikoo'))) fs.cpSync(dir, path.join(backup, 'twikoo'), { recursive: true });
    if (fs.existsSync(legacyFile) && !fs.existsSync(path.join(backup, 'comments.json'))) fs.copyFileSync(legacyFile, path.join(backup, 'comments.json'));
  }
  return { items: [...items.values()], config };
}
