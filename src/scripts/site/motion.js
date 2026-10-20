import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);
const ENTER = '[data-animate],.page-header,.article__header>*,.archive-year__head,.related-posts,.post-nav';

export function initMotion(signal) {
  // 每次 Astro 页面进入创建独立的动画上下文。减少动画偏好变化时重建上下文，
  // 页面离开时统一中断计时器、观察器、ticker 与指针事件，避免换页后残留固定占位。
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover:hover) and (pointer:fine)');
  let lenis;
  let ctx;
  let media;
  let observer;
  let frame = 0;
  let refreshTimer;
  let behaviors;
  const timers = new Set();
  const activeTriggers = () => ScrollTrigger.getAll().filter((t) => String(t.vars.id || '').startsWith('akiro-'));
  window.__akiroMotion = { get triggers() { return activeTriggers().length; }, get detached() { return activeTriggers().filter((t) => t.trigger && !t.trigger.isConnected).length; }, get smooth() { return Boolean(lenis); }, get reduced() { return reduced.matches; } };
  const later = (callback, delay) => {
    const timer = setTimeout(() => { timers.delete(timer); if (!signal.aborted) callback(); }, delay);
    timers.add(timer); return timer;
  };
  const tick = (time) => lenis?.raf(time * 1000);
  // 目录传入已扣除导航高度的绝对坐标，不再让锚点和原生滚动重复计算偏移。
  window.addEventListener('akiro:scroll-to', (event) => {
    if (!lenis) return;
    event.preventDefault();
    lenis.scrollTo(event.detail.top, { duration:.5, immediate:event.detail.reduced, force:true, onComplete:event.detail.onComplete });
  }, { signal });
  const cleanup = () => {
    clearTimeout(refreshTimer);
    timers.forEach(clearTimeout); timers.clear();
    cancelAnimationFrame(frame);
    behaviors?.abort();
    observer?.disconnect(); observer = undefined;
    media?.revert(); media = undefined;
    ctx?.revert(); ctx = undefined;
    gsap.ticker.remove(tick);
    lenis?.destroy(); lenis = undefined;
    document.querySelectorAll('.atlas-rail.is-pinned').forEach((el) => el.classList.remove('is-pinned'));
  };
  const refresh = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => { if (!signal.aborted) ScrollTrigger.refresh(); }, 140); };
  const setup = () => {
    cleanup();
    if (signal.aborted) return;
    behaviors = new AbortController();
    const behaviorSignal = behaviors.signal;
    const bindings = new WeakSet();
    const reveals = new WeakSet();
    if (!reduced.matches && fine.matches) {
      lenis = new Lenis({ duration: 1.2, smoothWheel: true, anchors: true,
        prevent: (node) => Boolean(node.closest('dialog,[data-lenis-prevent],.music-player__queue,.music-player__lyrics,.toc')) });
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(tick);
    }
    const animateCards = (scope) => {
      const elements = [...scope.querySelectorAll(ENTER)];
      elements.forEach((el, index) => {
        if (reveals.has(el)) return;
        reveals.add(el);
        if (reduced.matches || el.closest('[data-rail]') || el.getBoundingClientRect().bottom < 0) return;
        ctx.add(() => gsap.fromTo(el, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: .75, delay: Math.min(index % 4,3) * .035, ease: 'power3.out', scrollTrigger: { id: 'akiro-reveal', trigger: el, start: 'top 90%', once: true } }));
      });
      scope.querySelectorAll('[data-tilt],[data-magnetic],[data-spotlight]').forEach((el) => {
        if (bindings.has(el) || reduced.matches || !fine.matches) return;
        bindings.add(el);
        // quickTo 复用补间处理高频指针输入，避免每个 pointermove 新建动画。
        // 使用本次动效配置自己的 AbortSignal，切换减少动画偏好时也能移除旧监听。
        let xTo, yTo;
        ctx.add(() => {
          if (el.hasAttribute('data-tilt')) {
            xTo = gsap.quickTo(el,'rotationY',{duration:.5,ease:'power2.out'});
            yTo = gsap.quickTo(el,'rotationX',{duration:.5,ease:'power2.out'});
          } else if (el.hasAttribute('data-magnetic')) {
            xTo = gsap.quickTo(el,'x',{duration:.8,ease:'power3.out'});
            yTo = gsap.quickTo(el,'y',{duration:.8,ease:'power3.out'});
          }
        });
        el.addEventListener('pointermove', (event) => {
          if (reduced.matches || !fine.matches) return;
          const r = el.getBoundingClientRect();
          const x = event.clientX - r.left, y = event.clientY - r.top;
          if (el.hasAttribute('data-spotlight')) { el.style.setProperty('--spot-x', `${x}px`); el.style.setProperty('--spot-y', `${y}px`); }
          if (el.hasAttribute('data-tilt')) { xTo((x / r.width - .5) * 7); yTo((.5 - y / r.height) * 7); }
          else if (xTo) { xTo((x-r.width/2)*.15); yTo((y-r.height/2)*.15); }
        }, { signal: behaviorSignal });
        el.addEventListener('pointerleave', () => { xTo?.(0); yTo?.(0); }, { signal: behaviorSignal });
      });
    };
    ctx = gsap.context(() => {
      if (!reduced.matches) gsap.fromTo('[data-hero-reveal]', { y:26, opacity:0 }, { y:0, opacity:1, duration:.9, stagger:.07, delay:.1, ease:'power3.out', clearProps:'opacity,transform' });
      document.querySelectorAll('[data-typewriter]').forEach((el) => {
        let words;
        try { words = JSON.parse(el.dataset.typeWords); } catch { return; }
        if (!Array.isArray(words) || !words.length || reduced.matches) return;
        let wordIndex=0, length=words[0].length, deleting=true;
        const type = () => {
          const word = String(words[wordIndex]);
          length += deleting ? -1 : 1;
          el.textContent = word.slice(0, Math.max(0,length));
          if (!deleting && length >= word.length) { deleting=true; later(type,2500); }
          else if (deleting && length <= 0) { deleting=false; wordIndex=(wordIndex+1)%words.length; later(type,350); }
          else later(type,deleting ? 50 : 90);
        };
        later(type,2500);
      });
      document.querySelectorAll('[data-rotate-text]').forEach((el) => {
        let words; try { words=JSON.parse(el.dataset.rotateWords); } catch { return; }
        if (!Array.isArray(words) || !words.length || reduced.matches) return;
        let index=0;
        const rotate=() => {
          ctx.add(() => gsap.to(el,{y:-10,opacity:0,duration:.2,onComplete:()=>{
            if(signal.aborted)return;
            el.textContent=words[index=(index+1)%words.length];
            ctx.add(()=>gsap.fromTo(el,{y:10,opacity:0},{y:0,opacity:1,duration:.35}));
          }}));
          later(rotate,3200);
        };later(rotate,3200);
      });
      if (!reduced.matches) {
        document.querySelectorAll('[data-parallax]').forEach((el) => {
          const img = el.querySelector('img');
          if(!img || el.closest('[data-rail]'))return;
          gsap.fromTo(img,{yPercent:-6,scale:1.1},{yPercent:6,scale:1.1,ease:'none',scrollTrigger:{id:'akiro-parallax',trigger:el,start:'top bottom',end:'bottom top',scrub:true}});
          gsap.fromTo(el,{clipPath:'inset(12% 0 0 0)'},{clipPath:'inset(0% 0 0 0)',duration:1.2,ease:'power4.inOut',scrollTrigger:{id:'akiro-image',trigger:el,start:'top 92%',once:true}});
        });
        const peeker=document.querySelector('[data-footer-peeker]');
        if(peeker) gsap.fromTo(peeker,{y:20,rotation:-15},{y:0,rotation:0,ease:'none',scrollTrigger:{id:'akiro-footer',trigger:'.site-footer',start:'top bottom',end:'top 80%',scrub:true}});
      }
    });
    animateCards(document);
    observer = new MutationObserver((records) => { if(records.some((r)=>[...r.addedNodes].some((node)=>node.nodeType===1))) animateCards(document); });
    observer.observe(document.querySelector('main') || document.body,{childList:true,subtree:true});
    // 只有宽屏且允许动画时才固定横轨；触屏和小屏始终保留原生横向滚动。
    // 所有距离按实际内容测量，图片、字体和窗口变化后由 refresh 重新计算。
    media = gsap.matchMedia();
    media.add('(min-width:1024px) and (prefers-reduced-motion:no-preference)',() => {
      document.querySelectorAll('[data-rail]').forEach((section) => {
        const track=section.querySelector('[data-rail-track]'), viewport=section.querySelector('[data-rail-viewport]');
        if(!track||!viewport)return;
        const distance=()=>Math.max(0,track.scrollWidth-viewport.clientWidth);
        if(distance()<80)return;
        section.classList.add('is-pinned');
        viewport.scrollLeft=0;
        gsap.to(track,{x:()=>-distance(),ease:'none',scrollTrigger:{id:'akiro-rail',trigger:section,start:'top 100px',end:()=>`+=${Math.max(300,distance())}`,pin:true,scrub:.8,invalidateOnRefresh:true,anticipatePin:1,onUpdate:(self)=>{
          const progress=section.querySelector('[data-rail-progress]');if(progress)progress.style.transform=`scaleX(${.12+self.progress*.88})`;
        }}});
      });
      return () => document.querySelectorAll('[data-rail]').forEach((el)=>el.classList.remove('is-pinned'));
    });
    refresh();
  };
  setup();
  const heroMedia = document.querySelector('[data-hero-media]');
  if (heroMedia && !heroMedia.closest('[data-wallpaper-host]')) {
    heroMedia.addEventListener('error', () => { heroMedia.hidden = true; }, { signal });
    if (heroMedia instanceof HTMLImageElement && heroMedia.complete && !heroMedia.naturalWidth) heroMedia.hidden = true;
    if (heroMedia instanceof HTMLVideoElement) {
      const syncVideo = () => { if (reduced.matches) heroMedia.pause(); else heroMedia.play().catch(() => {}); };
      syncVideo(); reduced.addEventListener('change', syncVideo, { signal });
      signal.addEventListener('abort', () => heroMedia.pause(), { once:true });
    }
  }
  reduced.addEventListener('change', setup, { signal });
  // 窗口变化只更新尺寸与 matchMedia 分支；弹窗开启时暂停全局平滑滚动，
  // 独立列表、歌词、目录及原生 dialog 的滚动不交给 Lenis 接管。
  window.addEventListener('akiro:modal',(event)=>{ if(event.detail)lenis?.stop();else lenis?.start(); },{signal});
  window.addEventListener('akiro:appearance',refresh,{signal});
  window.addEventListener('resize',refresh,{signal,passive:true});
  window.addEventListener('load',refresh,{signal});
  document.fonts?.ready.then(()=>{if(!signal.aborted)refresh();});
  document.querySelectorAll('img').forEach((img)=>img.addEventListener('load',refresh,{signal,once:true}));
  document.querySelectorAll('[data-rail-viewport]').forEach((el)=>el.addEventListener('keydown',(event)=>{
    if(event.key!=='ArrowRight'&&event.key!=='ArrowLeft')return;
    const amount=event.key==='ArrowRight'?300:-300;
    const trigger=activeTriggers().find((t)=>t.trigger===el.closest('[data-rail]'));
    if(trigger){event.preventDefault();window.scrollTo({top:Math.min(trigger.end,Math.max(trigger.start,scrollY+amount)),behavior:reduced.matches?'instant':'smooth'});}
    else el.scrollBy({left:amount,behavior:reduced.matches?'instant':'smooth'});
  },{signal}));
  signal.addEventListener('abort',cleanup,{once:true});
}
