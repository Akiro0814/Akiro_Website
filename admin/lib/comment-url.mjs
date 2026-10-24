// 只处理展示层，不能拿解码文本替换评论的持久化路径或回复关联。
// decodeURI 保留 %2F、%3F 等结构字符；损坏的转义只保留原片段，不中断页面渲染。
export function displayCommentUrl(value) {
  const decoded = String(value || '').replace(/(?:%[0-9a-f]{2})+/gi, part => {
    try { return decodeURI(part); } catch { return part; }
  });
  return Array.from(decoded).filter(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127).join('');
}

export function commentNotificationText(comment, config = {}) {
  let link = '';
  try {
    const site = new URL(config.SITE_URL || process.env.SITE_URL || '');
    if (['https:', 'http:'].includes(site.protocol) && !site.username && !site.password) link = displayCommentUrl(new URL(comment.url, site).href);
  } catch { /* 没有站点地址时，仍能通过中文页面路径定位评论。 */ }
  return `页面：${displayCommentUrl(comment.url)}${link ? `\n链接：${link}` : ''}`;
}
