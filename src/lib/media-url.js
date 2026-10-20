// 构建期读取和后台写入共用同一校验，避免保存成功却无法在前台使用。
// 允许站内绝对路径与 HTTP(S)，拒绝脚本、协议相对地址、反斜杠和控制字符。
export function normalizeMediaUrl(value) {
  const url = typeof value === 'string' ? value.trim().slice(0, 2000) : '';
  if (!url || url.includes('\\') || [...url].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return '';
  if (/^\/(?!\/)/.test(url)) return url;
  if (!/^https?:\/\//i.test(url)) return '';
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.hostname ? url : '';
  } catch {
    return '';
  }
}
