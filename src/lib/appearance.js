export const STYLES = ['life', 'swiss', 'minimalist', 'glass', 'brutalist'];
// 配色与布局风格分开：同一组色彩可用于任何风格、明暗模式和后台工作台。
export const PALETTES = [
  { id: 'original', label: '暖白陶土', colors: ['#D97757', '#F0E4DB', '#FAF9F5'] },
  { id: 'ocean', label: '海盐蓝', colors: ['#598BFD', '#9AD4CB', '#35B3C9'] },
  { id: 'berry', label: '莓果雾', colors: ['#945FFA', '#F698B8', '#F7DFD9'] },
  { id: 'apricot', label: '杏光紫', colors: ['#BBADE6', '#FEC96D', '#E2ADB4'] },
  { id: 'coral', label: '珊瑚奶油', colors: ['#F0826E', '#F0B4A9', '#FEFEE1'] },
];
export const normalizePalette = (value) => PALETTES.some((p) => p.id === value) ? value : 'original';
// 本地存储属于不可信输入，只允许预定义值进入根元素的外观属性。
export const MODES = ['manual', 'time', 'scroll'];
export const normalizeAppearance = (style, mode) => ({
  style: STYLES.includes(style) ? style : 'life',
  mode: MODES.includes(mode) ? mode : 'manual',
});
export const styleForTime = (hour) => hour >= 6 && hour < 9 ? 'minimalist' : hour >= 9 && hour < 18 ? 'life' : 'glass';
export const styleForScroll = (progress) => progress < .25 ? 'life' : progress < .55 ? 'minimalist' : progress < .85 ? 'glass' : 'brutalist';
