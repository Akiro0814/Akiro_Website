// 目录独立处理章节定位，避免原生锚点、Astro 导航和 Lenis 同时接管同一次点击。
export function initToc(signal) {
  const links = [...document.querySelectorAll('.toc a[href^="#"]')];

  if (!links.length) {
    return;
  }

  const items = links
    .map((link) => {
      let id;
      try { id = decodeURIComponent(link.getAttribute('href').slice(1)); } catch { return { link, heading:null }; }
      return { link, heading: document.getElementById(id) };
    })
    .filter((item) => item.heading);

  if (!items.length) {
    return;
  }

  let current = null;
  const setActive = (link) => {
    if (current === link) {
      return;
    }
    current?.classList.remove('is-active');
    current?.removeAttribute('aria-current');
    link.classList.add('is-active');
    link.setAttribute('aria-current', 'location');
    current = link;
  };

  const navigationGap = () => Math.max(24, (document.querySelector('[data-site-header]')?.getBoundingClientRect().bottom || 80) + 24);
  for (const { link, heading } of items) {
    link.addEventListener('click', (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      event.stopPropagation();
      // 用元素 ID 查找而非 CSS 选择器，中文、数字开头和标点标题均可定位。
      const top = Math.max(0, heading.getBoundingClientRect().top + window.scrollY - navigationGap());
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const focus = () => {
        if (signal.aborted || !heading.isConnected) return;
        if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll:true });
        setActive(link);
      };
      const request = new CustomEvent('akiro:scroll-to', { cancelable:true, detail:{ top, reduced, onComplete:focus } });
      window.dispatchEvent(request);
      // 页面滚动器存在时由它同步内部目标，防止锚点刚跳过去又被旧惯性拉回。
      if (!request.defaultPrevented) {
        window.scrollTo({ top, behavior:reduced ? 'instant' : 'smooth' });
        focus();
      }
      history.replaceState(history.state, '', `#${encodeURIComponent(heading.id)}`);
    }, { signal });
  }

  let ticking = false;
  const sync = () => {
    ticking = false;
    const offset = navigationGap() + 16;
    let active = items[0].link;
    for (const { link, heading } of items) {
      if (heading.getBoundingClientRect().top <= offset) {
        active = link;
      } else {
        break;
      }
    }
    // 滚动到底部时，最后的标题可能永远不会越过偏移阈值
    // （页面已无剩余滚动量）。此时强制激活最后一项。
    if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 60) {
      active = items[items.length - 1].link;
    }
    setActive(active);
  };

  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(sync);
      }
    },
    { passive: true, signal },
  );
  sync();
}
