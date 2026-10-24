// 本站评论客户端：按页面独立实例，换页时取消请求与监听，不加载第三方 SDK。
import { marked } from 'marked';
import { sanitizeHtml } from './sanitize.js';

export const commentsAvailable = () => true;
export const commentsBackendId = () => '/api/public/comments';
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

/** @param {HTMLElement} root @param {{url?: string, onCount?: (count: number) => void}} [options] */
export function mountComments(root, { url = location.pathname, onCount } = {}) {
  const controller = new AbortController();
  const { signal } = controller;
  let page = 1; let order = 'newest'; let replyId = ''; let returnY = null; let disposed = false;
  let settings = { enabled: true, maxLength: 5000, placeholder: '留下你的想法，支持 Markdown…' };
  let challenge; let challengeAt = 0; let challengePromise;
  root.innerHTML = `<form class="ac-form" data-comment-form>
    <div class="ac-fields"><label>昵称 <span aria-hidden="true">*</span><input name="nick" required maxlength="40" autocomplete="nickname" placeholder="怎么称呼你"></label>
    <label>邮箱 <small>不公开，可选</small><input name="mail" type="email" maxlength="254" autocomplete="email" placeholder="用于接收回复通知"></label></div>
    <label class="ac-honeypot" aria-hidden="true">网站<input name="website" tabindex="-1" autocomplete="off"></label>
    <div class="ac-reply" hidden><span data-reply-label></span><button type="button" data-cancel-reply>取消回复</button></div>
    <label class="ac-text-label">评论内容<textarea name="comment" required rows="5" maxlength="5000" placeholder="留下你的想法，支持 Markdown…"></textarea></label>
    <div class="ac-preview prose" hidden></div>
    <div class="ac-actions"><span class="ac-hint">支持 Markdown · 提交后立即展示</span><button type="button" data-preview aria-pressed="false">预览</button><button type="submit" class="ac-primary">发表评论</button></div>
    <p class="ac-feedback" role="status" aria-live="polite"></p>
    </form><div class="ac-toolbar"><span data-total>正在加载评论…</span><div><label>排序 <select data-order><option value="newest">最新在前</option><option value="oldest">最早在前</option></select></label><button type="button" data-refresh>刷新</button></div></div>
    <div class="ac-list" aria-live="polite"></div><div class="ac-pages"></div>`;
  const form = root.querySelector('form');
  const textarea = form.elements.namedItem('comment');
  const nick = form.elements.namedItem('nick');
  try { nick.value = localStorage.getItem('akiro-comment-nick') || ''; } catch {}
  const status = root.querySelector('.ac-feedback');
  const say = (message, error = false) => { status.textContent = message; status.classList.toggle('is-error', error); };
  const request = async (endpoint, body) => {
    const response = await fetch('/api/_', { method: body ? 'POST' : 'GET', signal,
      headers: { 'X-Target': btoa(encodeURIComponent(`/api/public/comments${endpoint}`)), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json(); if (!response.ok) throw Error(result.error || '评论请求失败，请重试。'); return result;
  };
  const renew = () => challengePromise = request('/challenge').then(result => { challenge = result; challengeAt = Date.now(); });
  const token = async () => { try { await (challengePromise || renew()); } catch { await renew(); } if (Date.now() - challengeAt > 1500000) await renew(); const remaining = (challenge.minDelay || 800) - (Date.now() - challengeAt) + 30; if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining)); return challenge.token; };
  const renderItem = (item, replies = []) => `<article class="ac-comment${item.master ? ' is-master' : ''}" data-comment-id="${escape(item.id)}">
    <div class="ac-avatar" aria-hidden="true">${escape(Array.from(item.nick || '?')[0])}</div><div class="ac-comment-body">
    <header><strong>${escape(item.nick)}</strong>${item.master ? '<span class="ac-master">站长</span>' : ''}<time datetime="${new Date(item.created).toISOString()}">${escape(new Date(item.created).toLocaleString('zh-CN'))}</time></header>
    ${item.device ? `<div class="ac-device"><span>${escape(item.device.os)}</span><span>${escape(item.device.browser)}</span></div>` : ''}
    ${item.replyingTo ? `<p class="ac-reply-to">回复 @${escape(item.replyingTo)}</p>` : ''}<div class="ac-content prose">${sanitizeHtml(item.comment)}</div><footer><button type="button" data-reply="${escape(item.id)}" data-nick="${escape(item.nick)}">回复</button><button type="button" data-like="${escape(item.id)}" aria-label="赞同 ${escape(item.nick)} 的评论">赞 <span>${item.like}</span></button></footer>
    ${replies.length ? `<div class="ac-replies">${replies.map(r => renderItem({ ...r, replyingTo: [item, ...replies].find(parent => parent.id === r.pid)?.nick })).join('')}</div>` : ''}</div></article>`;
  let loadSequence = 0;
  const load = async () => {
    if (disposed) return; const sequence = ++loadSequence;
    try {
      const result = await request(`?url=${encodeURIComponent(url)}&page=${page}&order=${order}`);
      if (disposed || sequence !== loadSequence) return;
      settings = result.settings; page = result.page;
      onCount?.(result.total);
      root.querySelector('[data-total]').textContent = `${result.total} 条评论`;
      textarea.maxLength = settings.maxLength; textarea.placeholder = settings.placeholder;
      form.querySelector('[type="submit"]').disabled = !settings.enabled;
      root.querySelector('.ac-list').innerHTML = result.items.length ? result.items.map(item => renderItem(item, item.replies)).join('') : '<p class="ac-empty">这里还很安静，来留下第一条评论吧。</p>';
      root.querySelector('.ac-pages').innerHTML = result.pages > 1 ? `<button type="button" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>上一页</button><span>${page} / ${result.pages}</span><button type="button" data-page="${page + 1}" ${page >= result.pages ? 'disabled' : ''}>下一页</button>` : '';
      if (!settings.enabled) say('评论暂时关闭，已有评论仍可浏览。');
    } catch (error) { if (!signal.aborted) say(error.message, true); }
  };
  const clearReply = () => { replyId = ''; root.querySelector('.ac-reply').hidden = true; };
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (!form.reportValidity()) return;
    const button = form.querySelector('[type="submit"]'); if (button.disabled) return; button.disabled = true; say('正在发送…');
    try {
      let hints = {};
      try { if (navigator.userAgentData?.getHighEntropyValues) hints = await navigator.userAgentData.getHighEntropyValues(['platform', 'platformVersion']); } catch {}
      await request('', { url, nick: nick.value, mail: form.elements.namedItem('mail').value, comment: textarea.value, pid: replyId,
        website: form.elements.namedItem('website').value, token: await token(), hints });
      try { localStorage.setItem('akiro-comment-nick', nick.value); } catch {}
      textarea.value = ''; clearReply(); root.querySelector('.ac-preview').hidden = true; root.querySelector('[data-preview]').setAttribute('aria-pressed', 'false'); page = 1; order = 'newest'; root.querySelector('[data-order]').value = order;
      await load(); say('评论已发布，谢谢你的分享。');
      if (returnY !== null) { window.scrollTo({ top: returnY, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); returnY = null; }
      renew().catch(() => {});
    } catch (error) { if (!signal.aborted) say(error.message, true); }
    finally { button.disabled = !settings.enabled; }
  }, { signal });
  textarea.addEventListener('keydown', event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); form.requestSubmit(); } }, { signal });
  root.addEventListener('change', event => { if (event.target.matches('[data-order]')) { order = event.target.value; page = 1; load(); } }, { signal });
  root.addEventListener('click', async event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.hasAttribute('data-cancel-reply')) clearReply();
    if (button.hasAttribute('data-refresh')) load();
    if (button.hasAttribute('data-page')) { page = Number(button.dataset.page); await load(); }
    if (button.hasAttribute('data-preview')) { const preview = root.querySelector('.ac-preview'); preview.hidden = !preview.hidden; button.setAttribute('aria-pressed', String(!preview.hidden)); preview.innerHTML = sanitizeHtml(marked.parse(textarea.value, { async: false, breaks: true })); }
    if (button.dataset.reply) { replyId = button.dataset.reply; root.querySelector('.ac-reply').hidden = false; root.querySelector('[data-reply-label]').textContent = `回复 @${button.dataset.nick}`; textarea.focus(); }
    if (button.dataset.like) { button.disabled = true; try { const result = await request('', { action: 'like', id: button.dataset.like, token: await token() }); button.querySelector('span').textContent = result.like; button.setAttribute('aria-pressed', 'true'); } catch (error) { if (!signal.aborted) say(error.message, true); button.disabled = false; } }
  }, { signal });
  const ready = Promise.all([load(), renew().catch(error => { if (!signal.aborted) say(error.message, true); })]);
  const timer = setInterval(() => { if (!document.hidden) load(); }, 45000);
  return { ready,
    async quote({ text = '', returnY: y = NaN } = {}) { await ready; if (disposed) return; const quote = String(text).replace(/\s+/g, ' ').trim().slice(0, 360); if (!quote) return; returnY = Number.isFinite(y) ? y : null; textarea.value = `${textarea.value ? `${textarea.value.trimEnd()}\n\n` : ''}> ${quote}\n\n`; textarea.focus({ preventScroll: true }); textarea.setSelectionRange(textarea.value.length, textarea.value.length); },
    dispose() { disposed = true; controller.abort(); clearInterval(timer); },
  };
}
