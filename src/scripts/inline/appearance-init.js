(() => {
  // 放在 head 的极小初始化：首次绘制前恢复外观，换页时写入即将替换的新文档，
  // 避免玻璃/深色等风格在 Astro 切页时先闪回默认风格。
  const read = (root) => {
    let state = {};
    try { state = JSON.parse(localStorage.getItem('akiro-appearance') || '{}') || {}; } catch {}
    const style = ['life','swiss','minimalist','glass','brutalist'].includes(state.style) ? state.style : root.dataset.defaultStyle || 'life';
    const mode = ['manual','time','scroll'].includes(state.mode) ? state.mode : root.dataset.defaultMode || 'manual';
    const hour = new Date().getHours();
    return { style: mode === 'time' ? (hour >= 6 && hour < 9 ? 'minimalist' : hour >= 9 && hour < 18 ? 'life' : 'glass') : style, mode };
  };
  const apply = (root) => { const state = read(root); root.dataset.style = state.style; root.dataset.styleMode = state.mode; };
  apply(document.documentElement);
  document.addEventListener('astro:before-swap', (event) => { if (event.newDocument) apply(event.newDocument.documentElement); });
})();
