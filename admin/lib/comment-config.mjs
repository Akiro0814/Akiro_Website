// 通知配置集中做白名单与脱敏。管理页永不回显密钥，留空保留、显式勾选才清除。
export const NOTIFICATION_FIELDS = ['BLOGGER_EMAIL', 'SITE_NAME', 'SITE_URL', 'SENDER_NAME', 'SENDER_EMAIL', 'SMTP_HOST', 'SMTP_SERVICE', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'PUSHOO_CHANNEL', 'PUSHOO_TOKEN'];
const SECRET_FIELDS = ['SMTP_PASS', 'PUSHOO_TOKEN'];
export function effectiveNotificationConfig(state, env = process.env) {
  const config = { ...state.notificationConfig };
  const overrides = new Set(state.notificationOverrides || []);
  for (const key of NOTIFICATION_FIELDS) if (!overrides.has(key) && env[`COMMENTS_${key}`] !== undefined) config[key] = env[`COMMENTS_${key}`];
  return config;
}
export function maskedNotificationConfig(state) {
  const config = effectiveNotificationConfig(state);
  return { config: Object.fromEntries(NOTIFICATION_FIELDS.filter(key => !SECRET_FIELDS.includes(key)).map(key => [key, String(config[key] ?? (key === 'SMTP_PORT' ? '465' : key === 'SMTP_SECURE' ? 'true' : ''))])),
    secrets: Object.fromEntries(SECRET_FIELDS.map(key => [key, Boolean(config[key])])) };
}
export function updateNotificationConfig(state, input) {
  const next = { ...state.notificationConfig };
  const overrides = new Set(state.notificationOverrides || []);
  for (const key of NOTIFICATION_FIELDS) {
    if (SECRET_FIELDS.includes(key) && input[`clear${key}`] === true) { next[key] = ''; overrides.add(key); continue; }
    if (!Object.hasOwn(input, key)) continue;
    const raw = String(input[key] ?? '');
    if (SECRET_FIELDS.includes(key) && !raw) continue;
    const value = SECRET_FIELDS.includes(key) ? raw : raw.trim();
    if (value.length > (SECRET_FIELDS.includes(key) ? 4096 : 500) || /[\r\n\0]/.test(value)) throw Error('通知配置包含过长或无效的内容。');
    if (key === 'SMTP_PORT' && (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535)) throw Error('SMTP 端口应为 1–65535。');
    if (key === 'SMTP_SECURE' && !['true', 'false'].includes(value)) throw Error('请选择有效的 SMTP 加密方式。');
    if (['BLOGGER_EMAIL', 'SENDER_EMAIL'].includes(key) && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw Error('请填写有效的通知邮箱。');
    if (key === 'SMTP_HOST' && value && !/^[\w.:[\]-]+$/.test(value)) throw Error('SMTP 主机只填写域名或 IP，不包含协议和路径。');
    if (key === 'PUSHOO_CHANNEL' && !['', 'serverchan'].includes(value)) throw Error('请选择支持的站长推送通道。');
    if (key === 'PUSHOO_TOKEN' && value && !/^SCT[\w-]+$/.test(value)) throw Error('请填写 Server酱 Turbo 的 SCT SendKey。');
    if (key === 'SITE_URL' && value) {
      let url; try { url = new URL(value); } catch { throw Error('站点地址应为完整的 HTTP(S) 地址。'); }
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw Error('站点地址不能包含凭据，且必须使用 HTTP(S)。');
    }
    next[key] = value; overrides.add(key);
  }
  // 所有字段通过校验后才一起修改状态，失败不能留下部分新值。
  state.notificationConfig = next; state.notificationOverrides = [...overrides];
}
