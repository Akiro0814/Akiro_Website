// 参数白名单同时驱动设置面板和光标；任何本地存储值都先校验再进入 CSS 或动画。
export const CURSOR_STORAGE_KEY = 'akiro-cursor';
export const CURSOR_RANGES = {
  duration: { label: '跟随柔和度', hint: '越高越柔和，越低越跟手', min: 20, max: 220, step: 5, unit: 'ms' },
  maxLag: { label: '跟随幅度', hint: '越小越贴手，越大越有漂浮感', min: 8, max: 120, step: 2, unit: 'px' },
  size: { label: '光标大小', hint: '只改变大小，尖端仍对齐点击位置', min: 16, max: 48, step: 1, unit: 'px' },
  hoverScale: { label: '悬停放大', hint: '移到链接或按钮时的大小', min: 1, max: 1.35, step: .01, unit: '%' },
  pressScale: { label: '按下缩放', hint: '鼠标按下时的大小', min: .7, max: 1, step: .01, unit: '%' },
  transition: { label: '缩放过渡时长', hint: '悬停与按下反馈的柔和程度', min: 0, max: 400, step: 10, unit: 'ms' },
};
// 默认只显示精确跟手的箭头，平滑跟随由访客主动开启；已保存的选择继续优先。
export const CURSOR_DEFAULTS = Object.freeze({ version: 3, enabled: true, smooth: false, duration: 70, maxLag: 24, size: 24, hoverScale: 1.07, pressScale: .94, transition: 180 });

export function normalizeCursorSettings(value) {
  let input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  // 旧版原始默认值跟随过重；只迁移这组未调节的默认参数，保留用户自行调过的组合。
  if (!input.version && input.duration === 95 && input.maxLag === 48) input = { ...input, duration: 70, maxLag: 24 };
  const result = { ...CURSOR_DEFAULTS };
  for (const key of ['enabled', 'smooth']) if (typeof input[key] === 'boolean') result[key] = input[key];
  for (const [key, range] of Object.entries(CURSOR_RANGES)) {
    const raw = input[key];
    // null、空串和布尔值不能被 Number() 意外转成有效的 0/1。
    if ((typeof raw !== 'number' && typeof raw !== 'string') || String(raw).trim() === '') continue;
    const number = Number(raw);
    if (Number.isFinite(number)) {
      const bounded = Math.max(range.min, Math.min(range.max, number));
      result[key] = Number((range.min + Math.round((bounded - range.min) / range.step) * range.step).toFixed(2));
    }
  }
  return result;
}

export function readCursorSettings(storage) {
  try { return normalizeCursorSettings(JSON.parse(storage?.getItem(CURSOR_STORAGE_KEY) || 'null')); }
  catch { return { ...CURSOR_DEFAULTS }; }
}
let current;
const browserStorage = () => { try { return window.localStorage; } catch { return null; } };
export function getCursorSettings() {
  current ??= readCursorSettings(browserStorage());
  return { ...current };
}
export function setCursorSettings(patch, reset = false) {
  current = normalizeCursorSettings(reset ? CURSOR_DEFAULTS : { ...getCursorSettings(), ...patch });
  // 即使存储被禁用，本次页面内的设置仍可通过内存与事件正常工作。
  try {
    if (reset) browserStorage()?.removeItem(CURSOR_STORAGE_KEY);
    else browserStorage()?.setItem(CURSOR_STORAGE_KEY, JSON.stringify(current));
  } catch {}
  window.dispatchEvent(new Event('akiro:cursor-settings'));
  return { ...current };
}
export function reloadCursorSettings() {
  current = readCursorSettings(browserStorage());
  window.dispatchEvent(new Event('akiro:cursor-settings'));
}
