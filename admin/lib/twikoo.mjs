// 使用官方 tkserver 的请求处理器与数据库，不再自行模拟 Twikoo 协议。
// 管理员令牌只留在服务端；浏览器管理操作继续依赖博客 session + CSRF。
import crypto from 'node:crypto';
import path from 'node:path';
import { toTkRequest, getRequestTimesClearInterval } from 'tkserver';
import { createHandler, scaffoldAdapters, FULL_CAPABILITIES, LokiDatabase, MongoDatabase, getPostSubmitService, resetRequestTimes } from '@twikoojs/common';
import { DATA_DIR, readJSON, writeJSONAsync } from './store.mjs';
import { sanitizeComments } from './published-comments.mjs';

export const PUBLIC_TWIKOO_EVENTS = new Set(['GET_FUNC_VERSION', 'GET_CONFIG', 'GET_PASSWORD_STATUS', 'COMMENT_GET', 'COMMENT_SUBMIT', 'COMMENT_LIKE', 'COMMENT_DELETE_FOR_USER', 'GET_COMMENTS_COUNT', 'GET_RECENT_COMMENTS', 'COUNTER_GET', 'GET_QQ_NICK', 'CAP_CHALLENGE', 'CAP_REDEEM', 'UPLOAD_IMAGE']);
const md5 = (value) => crypto.createHash('md5').update(value).digest('hex');
export const plainComment = (value) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

export function legacyToTwikoo(comment) {
  const root = String(comment.pid || '');
  return {
    _id: String(comment.id), nick: String(comment.nick || '匿名'), mail: String(comment.mail || ''),
    mailMd5: comment.mailMd5 || md5(String(comment.mail || '').trim().toLowerCase()),
    url: String(comment.url), href: String(comment.url), link: String(comment.link || ''),
    comment: String(comment.comment || ''), commentMd: String(comment.commentMd || ''),
    created: Number(comment.created) || Date.now(), updated: Number(comment.created) || Date.now(),
    ...(root ? { rid: root, pid: String(comment.rid || root) } : {}),
    master: Boolean(comment.master), isSpam: comment.status === 'hidden', ua: String(comment.ua || ''),
    // 2.x 客户端优先读取 ups，不能同时放空 ups 和非空旧 like，否则点赞数会显示为零。
    ups: Array.from({ length: Math.min(10000, Math.max(0, Number(comment.like) || 0)) }, (_, i) => `legacy-${i}`), downs: [],
  };
}

export function createTwikooService({ dataDir, legacyComments = () => [], secret = 'dev-insecure-secret', remoteUrl = '', adminToken = '', mongoUri = '', siteUrl = '', summary = async () => {}, postSubmit = (comment, context) => getPostSubmitService()(comment, context) } = {}) {
  const token = adminToken || crypto.createHmac('sha256', secret).update('Akiro/Twikoo/admin/v1').digest('hex');
  let database;
  let adapterDatabase;
  let handler;
  let initialized;
  let databaseQueue = Promise.resolve();
  const requests = new Set();
  const background = new Set();
  let timer;
  const run = (operation) => {
    const result = Promise.resolve().then(operation);
    requests.add(result);
    result.then(() => requests.delete(result), () => requests.delete(result));
    return result;
  };
  // Loki 官方适配器 close() 会保存并关闭；重新 init 保证返回成功前已持久化。
  // 只串行数据库调用，不让邮件/审核的网络等待阻塞前台读取。
  const flush = async () => { if (database && !mongoUri) { await database.close(); await database.init(); } };
  const updateSummary = async () => {
    try { await summary(await database.getAllComments()); }
    catch { console.warn('[twikoo] 评论统计快照更新失败；评论数据库仍已保存。'); }
  };
  const initialize = () => initialized ??= (async () => {
    if (remoteUrl) {
      const url = new URL(remoteUrl);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error('Twikoo 服务地址应为不含凭据的 HTTP(S) 地址。');
      return;
    }
    database = mongoUri ? new MongoDatabase({ uri: mongoUri }) : new LokiDatabase({ dataDir });
    await database.init();
    const config = await database.getConfig() || {};
    if (config.ADMIN_PASS && !config.AKIRO_MANAGED && !adminToken) throw Error('现有 Twikoo 数据库需配置 TWIKOO_ADMIN_TOKEN，未改动已有管理密码。');
    await database.saveConfig({
      ...(!config.ADMIN_PASS || config.AKIRO_MANAGED ? { ADMIN_PASS: md5(token), AKIRO_MANAGED: true } : {}),
      ...(!config.BLOGGER_EMAIL ? { BLOGGER_EMAIL: 'blogger@localhost.invalid' } : {}),
      ...(!config.GRAVATAR_CDN ? { GRAVATAR_CDN: 'cravatar.cn' } : {}),
      ...(!config.SITE_URL && siteUrl ? { SITE_URL: siteUrl } : {}),
      ...(!config.CORS_ALLOW_ORIGIN && siteUrl ? { CORS_ALLOW_ORIGIN: siteUrl } : {}),
    });
    // 保留原文件，按原 ID 幂等迁移；标记持久化后，已在新库删除的评论不再复活。
    if (!config.AKIRO_LEGACY_IMPORTED) {
      const existing = new Set((await database.getAllComments()).map((item) => String(item._id)));
      const legacy = legacyComments();
      const incoming = (Array.isArray(legacy) ? legacy : []).filter((item) => item?.id && item.url && !existing.has(String(item.id))).map(legacyToTwikoo);
      await database.bulkAddComments(incoming);
      await database.saveConfig({ AKIRO_LEGACY_IMPORTED: true, AKIRO_LEGACY_COUNT: incoming.length });
    }
    await flush();
    await updateSummary();
    const writes = new Set(['addComment', 'bulkAddComments', 'updateComment', 'deleteComment', 'saveConfig', 'incCounter', 'capSet', 'capDel', 'capDeleteExpired']);
    // 官方异步后置审核与通知也通过同一适配器访问数据库。逐方法互斥避免在
    // 后置任务仍写库时关闭 Loki，同时保证每次写入成功前落盘，正常退出会排空任务。
    adapterDatabase = new Proxy(database, {
      get(target, key) {
        if (typeof target[key] !== 'function') return target[key];
        return (...args) => {
          const result = databaseQueue.then(async () => {
            const value = await target[key](...args);
            if (writes.has(key)) {
              await flush();
              if (['addComment', 'bulkAddComments', 'updateComment', 'deleteComment'].includes(key)) await updateSummary();
            }
            return value;
          });
          databaseQueue = result.catch(() => {});
          return result;
        };
      },
    });
    handler = createHandler(scaffoldAdapters({
      request: { toTkRequest: (request) => request }, response: { fromTkResponse: (response) => response },
      database: adapterDatabase, capabilities: FULL_CAPABILITIES,
      postSubmit: { dispatch(comment, context) {
        const task = Promise.resolve().then(() => postSubmit(comment, context));
        background.add(task);
        task.then(() => background.delete(task), () => { background.delete(task); console.warn('[twikoo] 后置审核或通知失败，请在管理面板检查服务配置。'); });
        return Promise.resolve();
      } },
    }));
    timer = setInterval(resetRequestTimes, getRequestTimesClearInterval());
    timer.unref();
  })();
  const invoke = async (body, context = {}, managed = false) => {
    await initialize();
    if (managed && remoteUrl && !adminToken) throw Error('外部 Twikoo 需配置 TWIKOO_ADMIN_TOKEN 才能在博客后台管理。');
    const payload = { ...body, ...(managed ? { accessToken: token } : {}) };
    if (managed && payload.event === 'SET_CONFIG') {
      payload.config = Object.fromEntries(Object.entries(payload.config || {}).filter(([key]) => key !== 'ADMIN_PASS' && key !== 'CREDENTIALS' && !key.startsWith('AKIRO_')));
    }
    if (managed && ['SET_PASSWORD', 'LOGIN'].includes(payload.event)) return { status: 200, body: { code: 1000, message: '管理身份由博客登录维护，请在博客账户中管理登录凭据。' } };
    let result;
    if (remoteUrl) {
      const response = await fetch(remoteUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(20000) });
      result = { status: response.status, body: await response.json() };
    } else {
      result = await handler(toTkRequest({ method: 'POST', url: '/', body: payload, headers: { 'user-agent': context.ua || 'Akiro-Blog', ...(context.origin ? { origin: context.origin } : {}), 'x-real-ip': context.ip || '127.0.0.1' } }));
    }
    if (!result) throw Error('Twikoo 未返回有效响应。');
    if (managed) {
      // 官方响应会回传 accessToken；桥接时必须删除，不能把服务端令牌送进浏览器。
      delete result.body.accessToken;
      if (result.body.config) {
        result.body.config.HIDE_ADMIN_CRYPT = '';
        delete result.body.config.ADMIN_PASS;
        for (const key of Object.keys(result.body.config)) if (key.startsWith('AKIRO_')) delete result.body.config[key];
      }
      // 原生导出/管理列表可能包含评论 uid 或投票 uid，剔除服务端身份值。
      // 普通匿名 uid 保持官方格式；桥接令牌即使出现在嵌套数组也不能下发。
      result.body = JSON.parse(JSON.stringify(result.body, (_key, value) => value === token ? undefined : value));
    }
    else if (body.event === 'GET_CONFIG' && result.body.config) result.body.config.HIDE_ADMIN_CRYPT = 'AKIRO_MANAGED_ADMIN_ONLY';
    delete result.body.log;
    return result;
  };
  const allDocuments = async () => {
    await initialize();
    if (database) return adapterDatabase.getAllComments();
    const all = [];
    let page = 1;
    while (true) {
      const result = await invoke({ event: 'COMMENT_GET_FOR_ADMIN', per: 100, page }, {}, true);
      if (result.body.code !== 0) throw Error(result.body.message || 'Twikoo 评论读取失败。');
      all.push(...result.body.data);
      if (all.length >= result.body.count || !result.body.data.length) return all;
      page++;
    }
  };
  return {
    publicCall(body, context) {
      if (!PUBLIC_TWIKOO_EVENTS.has(body?.event)) return Promise.resolve({ status: 403, body: { code: 1000, message: '此操作请登录博客后台后执行。' } });
      return run(() => invoke(body, context));
    },
    adminCall: (body, context) => run(() => invoke(body, context, true)),
    documents: () => run(allDocuments),
    snapshot: () => run(async () => {
      const documents = await allDocuments();
      const publicConfig = await invoke({ event: 'GET_CONFIG' });
      const adminConfig = await invoke({ event: 'GET_CONFIG_FOR_ADMIN' }, {}, true);
      if (publicConfig.body.code !== 0 || adminConfig.body.code !== 0) throw Error('评论发布快照配置读取失败。');
      // 官方公开配置不含分页/显示控制项，仅补齐明确允许公开的查询参数。
      const config = { ...publicConfig.body.config };
      for (const key of ['COMMENT_PAGE_SIZE', 'SHOW_UA', 'SHOW_REGION', 'TOP_DISABLED']) {
        if (adminConfig.body.config?.[key] !== undefined) config[key] = adminConfig.body.config[key];
      }
      const counters = database ? await adapterDatabase.getAllCounters() : [];
      return { comments: sanitizeComments(documents), config,
        counters: counters.map(({ url, time }) => ({ url, time })) };
    }),
    async close() { await Promise.allSettled([...requests]); await Promise.allSettled([...background]); await databaseQueue; if (timer) clearInterval(timer); if (database) await database.close(); },
    mode: remoteUrl ? 'remote' : mongoUri ? 'mongodb' : 'local',
  };
}

export const twikoo = createTwikooService({
  dataDir: process.env.TWIKOO_DATA || path.join(DATA_DIR, 'twikoo'),
  legacyComments: () => readJSON('comments.json', []),
  secret: process.env.SESSION_SECRET || 'dev-insecure-secret',
  remoteUrl: process.env.TWIKOO_ENV_ID || process.env.PUBLIC_TWIKOO_ENV_ID || '',
  adminToken: process.env.TWIKOO_ADMIN_TOKEN || '',
  mongoUri: process.env.MONGODB_URI || process.env.MONGO_URL || '',
  siteUrl: process.env.SITE_URL || '',
  summary: async (items) => writeJSONAsync('twikoo-summary.json', { total: items.length, visible: items.filter((item) => !item.isSpam).length, updated: Date.now() }),
});
