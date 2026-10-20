import { CURSOR_RANGES, getCursorSettings, setCursorSettings } from '../../lib/cursor-settings.js';

export function initCursorSettings(signal) {
  const panel = document.getElementById('cursor-panel');
  if (!panel) return;
  const tabs = [...document.querySelectorAll('[data-console-tab]')];
  const selectTab = (selected) => {
    for (const tab of tabs) {
      const active = tab.dataset.consoleTab === selected;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
    }
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab.dataset.consoleTab), { signal });
    tab.addEventListener('keydown', (event) => {
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : -1;
      if (next < 0) return;
      event.preventDefault(); selectTab(tabs[next].dataset.consoleTab); tabs[next].focus();
    }, { signal });
  });
  const fine = matchMedia('(pointer: fine)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const sync = () => {
    const settings = getCursorSettings();
    panel.querySelectorAll('[data-cursor-setting]').forEach((el) => {
      const key = el.dataset.cursorSetting;
      if (el.type === 'checkbox') el.checked = settings[key];
      else {
        el.value = settings[key];
        const field = CURSOR_RANGES[key];
        panel.querySelector(`[data-cursor-output="${key}"]`).textContent = `${field.unit === '%' ? Math.round(settings[key] * 100) : settings[key]}${field.unit}`;
      }
      el.disabled = key !== 'enabled' && (!settings.enabled || (['duration', 'maxLag'].includes(key) && !settings.smooth));
    });
    panel.querySelector('[data-cursor-status]').textContent = !fine.matches ? '当前为触屏设备，不显示自定义光标。偏好仍会保存。' : reduced.matches ? '系统已开启减少动态效果：跟随与缩放暂时关闭，参数偏好仍保留。' : !settings.enabled ? '已切换为系统指针。偏好仅保存在当前浏览器。' : !settings.smooth ? '已关闭跟随缓动，保留自定义光标。偏好已自动保存。' : '正在实时预览，偏好仅保存在当前浏览器。';
  };
  panel.addEventListener('input', (event) => {
    const el = event.target;
    if (!el.matches?.('[data-cursor-setting]')) return;
    setCursorSettings({ [el.dataset.cursorSetting]: el.type === 'checkbox' ? el.checked : Number(el.value) });
  }, { signal });
  panel.querySelector('[data-cursor-reset]').addEventListener('click', () => setCursorSettings({}, true), { signal });
  window.addEventListener('akiro:cursor-settings', sync, { signal });
  fine.addEventListener('change', sync, { signal });
  reduced.addEventListener('change', sync, { signal });
  sync();
}
