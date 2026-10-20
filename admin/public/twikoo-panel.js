// 此脚本只运行在已登录的隔离 iframe；为 SDK 发往本站管理接口的请求加 CSRF。
// 不修改博客页面的 fetch，也不在浏览器保存或接收 Twikoo 管理员令牌。
(() => {
  const originalFetch = window.fetch.bind(window);
  const endpoint = new URL('/api/manage/twikoo', location.origin).href;
  const csrf = document.querySelector('meta[name="csrf-token"]').content;
  window.fetch = (input, init = {}) => {
    const url = input instanceof Request ? input.url : new URL(String(input), location.href).href;
    if (url !== endpoint) return originalFetch(input, init);
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    headers.set('X-CSRF-Token', csrf);
    return originalFetch(input, { ...init, headers, credentials: 'same-origin' });
  };
  const status = document.getElementById('twikoo-status');
  // 同源 iframe 跟随博客后台的实际明暗主题；离页时解除父文档上的观察器。
  const parentRoot = parent.document.documentElement;
  const syncTheme = () => { document.documentElement.dataset.theme = parentRoot.dataset.theme || 'light'; };
  const themeObserver = new MutationObserver(syncTheme);
  themeObserver.observe(parentRoot, { attributes: true, attributeFilter: ['data-theme'] });
  window.addEventListener('pagehide', () => themeObserver.disconnect(), { once: true });
  syncTheme();
  const open = () => {
    // 2.0.15 官方组件将齿轮放在评论操作区最后一项（与其他图标共用类名）。
    const button = document.querySelector('.tk-comments-actions .tk-icon:last-child');
    if (button) button.click();
  };
  document.getElementById('open-twikoo-admin').addEventListener('click', open);
  window.twikoo.init({ envId: endpoint, el: '#twikoo-admin-mount', path: '/__twikoo_admin__/', lang: 'zh-CN' }).then(() => {
    status.textContent = '博客登录已验证，可直接管理评论与配置。';
    const observer = new MutationObserver(() => {
      if (document.querySelector('.tk-comments-actions .tk-icon:last-child')) { open(); observer.disconnect(); }
    });
    observer.observe(document.getElementById('twikoo-admin-mount'), { childList: true, subtree: true });
    requestAnimationFrame(open);
    setTimeout(() => observer.disconnect(), 10000);
  }).catch(() => { status.textContent = 'Twikoo 管理面板加载失败，请检查服务配置后刷新。'; });
})();
