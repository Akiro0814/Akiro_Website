import nodemailer from 'nodemailer';
import { plainComment } from './comment-migration.mjs';
import { commentNotificationText } from './comment-url.mjs';

// 旧私密配置仅在服务端迁移使用；正文作为纯文本发送，任何密钥不进入公开 DTO。
export async function deliverCommentNotifications(comment, recipients, config = {}, { createTransport = nodemailer.createTransport, fetcher = fetch } = {}) {
  const siteName = String(config.SITE_NAME || '博客').replace(/[\r\n]/g, '').slice(0, 80);
  const text = `${comment.nick}：${plainComment(comment.comment)}\n${commentNotificationText(comment, config)}`;
  const to = [...new Set([recipients.owner ? config.BLOGGER_EMAIL : '', recipients.reply].filter(Boolean))];
  if (to.length && (config.SMTP_HOST || config.SMTP_SERVICE) && config.SMTP_USER && config.SMTP_PASS) {
    const secure = String(config.SMTP_SECURE) !== 'false';
    const transport = createTransport({ host: config.SMTP_HOST || undefined, service: config.SMTP_HOST ? undefined : config.SMTP_SERVICE || undefined,
      port: Number(config.SMTP_PORT) || 465, secure, requireTLS: !secure,
      auth: { user: config.SMTP_USER, pass: config.SMTP_PASS }, connectionTimeout: 10000, socketTimeout: 15000 });
    try { await transport.sendMail({ from: { name: config.SENDER_NAME || config.SITE_NAME || 'Akiro 评论', address: config.SENDER_EMAIL || config.SMTP_USER }, bcc: to, subject: `${siteName}有新的评论或回复`, text }); }
    finally { transport.close(); }
  }
  if (recipients.owner && config.PUSHOO_CHANNEL === 'serverchan' && /^SCT[\w-]+$/.test(config.PUSHOO_TOKEN || '')) {
    const response = await fetcher(`https://sctapi.ftqq.com/${config.PUSHOO_TOKEN}.send`, { method: 'POST', body: new URLSearchParams({ title: `${siteName}收到新评论`, desp: text }), signal: AbortSignal.timeout(15000) });
    const result = await response.json(); if (!response.ok || Number(result.code) !== 0) throw Error('评论推送失败');
  }
}
