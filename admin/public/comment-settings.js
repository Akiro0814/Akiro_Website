// 管理界面无刷新换页也复用文档级监听；所有写入继承博客会话和 CSRF。
const request = async (target, body) => {
  const response = await fetch(target.endsWith('/import') ? '/api/manage/comments/import' : '/api/_', {
    method: body ? 'POST' : 'GET', headers: {
      'X-Target': btoa(encodeURIComponent(target)),
      ...(body ? { 'Content-Type': 'application/json', 'X-CSRF-Token': window.__BOOT__?.csrfToken || document.querySelector('meta[name="csrf-token"]')?.content || '' } : {}),
    }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json(); if (!response.ok) throw Error(result.error || '操作失败'); return result;
};
document.addEventListener('submit', async event => {
  if (event.target.id === 'comment-notifications-form') {
    event.preventDefault(); const form = event.target;
    const status = form.querySelector('[data-comment-notifications-status]');
    const button = form.querySelector('button[type="submit"]'); button.disabled = true;
    try {
      const body = Object.fromEntries(new FormData(form));
      for (const key of ['SMTP_PASS', 'PUSHOO_TOKEN']) body[`clear${key}`] = form.elements.namedItem(`clear${key}`).checked;
      const saved = await request('/api/manage/comments/notifications', body);
      for (const key of ['SMTP_PASS', 'PUSHOO_TOKEN']) {
        const field = form.elements.namedItem(key); field.value = ''; field.placeholder = saved.secrets[key] ? '已配置，留空保留原值' : '尚未配置';
        form.elements.namedItem(`clear${key}`).checked = false;
      }
      status.textContent = '通知配置已保存，立即生效。';
      const health = (await request('/api/manage/comments/settings')).health;
      const info = document.querySelector('[data-comment-notifications-health]');
      if (info) info.textContent = `SMTP：${health.smtpConfigured ? '已配置' : '未配置'} · 站长推送：${health.pushConfigured ? '已配置' : '未配置'} · 待处理通知：${health.pendingNotifications}`;
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
    return;
  }
  if (event.target.id !== 'comment-settings-form') return;
  event.preventDefault(); const form = event.target; const status = form.querySelector('[data-comment-settings-status]');
  const button = form.querySelector('button[type="submit"]'); button.disabled = true;
  try {
    const body = {};
    for (const key of ['enabled', 'showDevice', 'notifyOwner', 'notifyReply']) body[key] = form.elements.namedItem(key).checked;
    for (const key of ['pageSize', 'maxLength']) body[key] = Number(form.elements.namedItem(key).value);
    body.placeholder = form.elements.namedItem('placeholder').value;
    await request('/api/manage/comments/settings', body); status.textContent = '评论设置已保存，前台即时生效。';
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
});
document.addEventListener('click', async event => {
  const button = event.target.closest('[data-comments-export]'); if (!button) return;
  const status = document.querySelector('[data-comment-import-status]'); button.disabled = true;
  try {
    const data = await request('/api/manage/comments/export');
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `akiro-comments-${new Date().toISOString().slice(0, 10)}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); status.textContent = '评论已导出。';
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
});
document.addEventListener('change', async event => {
  if (!event.target.matches('[data-comments-import]')) return;
  const input = event.target; const file = input.files?.[0]; if (!file) return;
  const status = document.querySelector('[data-comment-import-status]');
  try {
    if (file.size > 16 * 1024 * 1024) throw Error('文件超过 16MB，请分批导入。');
    const result = await request('/api/manage/comments/import', JSON.parse(await file.text()));
    status.textContent = `导入完成，新增 ${result.added} 条评论。`;
  } catch (error) { status.textContent = error.message; }
  finally { input.value = ''; }
});
