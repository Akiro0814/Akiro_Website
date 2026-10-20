export const STYLES = ['life', 'swiss', 'minimalist', 'glass', 'brutalist'];
// 本地存储属于不可信输入，只允许预定义值进入根元素的外观属性。
export const MODES = ['manual', 'time', 'scroll'];
export const normalizeAppearance = (style, mode) => ({
  style: STYLES.includes(style) ? style : 'life',
  mode: MODES.includes(mode) ? mode : 'manual',
});
export const styleForTime = (hour) => hour >= 6 && hour < 9 ? 'minimalist' : hour >= 9 && hour < 18 ? 'life' : 'glass';
export const styleForScroll = (progress) => progress < .25 ? 'life' : progress < .55 ? 'minimalist' : progress < .85 ? 'glass' : 'brutalist';
