// 在首帧前恢复个人外观。校验使用有限白名单；不把本地存储字符串拼入 HTML 或 CSS。
(() => {
  try {
    const saved = JSON.parse(localStorage.getItem('blog.appearance') || '{}') || {};
    const root = document.documentElement;
    const theme = ['light', 'dark', 'auto'].includes(saved.theme) ? saved.theme : 'auto';
    root.dataset.theme = theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
    root.dataset.palette = ['original', 'ocean', 'berry', 'apricot', 'coral'].includes(saved.palette) ? saved.palette : 'original';
    root.dataset.density = ['comfy', 'regular', 'compact'].includes(saved.density) ? saved.density : 'regular';
  } catch { /* 存储损坏时让页面使用默认外观，后续规范化后可重新保存。 */ }
})();
