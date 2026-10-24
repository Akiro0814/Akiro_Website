import { glassSpring } from '../../lib/liquid-glass.js';
import { applyGlassTexture } from './glass-textures.js';

// 参考仓库的按钮材质与交互：每个按钮独立采样真实背景、压扁、局部拉伸、
// 500ms 阻尼回弹和 1400ms 轮廓体积光。导航保持原位置，不引入自由拖动。
export function initGlassButtons(nav, template, signal) {
  const buttons=[...nav.querySelectorAll('.atlas-nav__links a,.atlas-nav__tools>.atlas-icon,.atlas-menu-toggle')];
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const opaque=matchMedia('(prefers-reduced-transparency: reduce)');
  const effects=new Set(), animations=new Map();
  let pressed,frame=0,point;
  const states=buttons.map((button,index)=>{
    const filter=template.cloneNode(true);filter.id=`akiro-button-refraction-${index}`;
    template.parentElement.append(filter);
    const glass=document.createElement('span'),light=document.createElement('span');
    glass.className='nav-button__glass';light.className='nav-button__light';
    glass.setAttribute('aria-hidden','true');light.setAttribute('aria-hidden','true');
    button.prepend(glass,light);button.dataset.liquidButton='true';
    button.style.setProperty('--button-refraction',`url('#${filter.id}')`);
    return {button,filter,glass,light,signature:''};
  });
  const update=()=>{
    for(const state of states) {
      const w=state.button.clientWidth,h=state.button.clientHeight,key=`${w}/${h}`;
      if(!w||!h||key===state.signature) continue;
      try { applyGlassTexture(state.filter,w,h);state.signature=key; } catch { state.button.dataset.liquidButton='false'; }
    }
  };
  const resize=new ResizeObserver(update);buttons.forEach((button)=>resize.observe(button));update();
  const illuminate=(source,x,y)=>{
    for(const {button,light} of states) {
      const r=button.getBoundingClientRect(),distance=Math.hypot(r.x+r.width/2-x,r.y+r.height/2-y);
      light.style.setProperty('--lx',`${(x-r.x)/r.width*100}%`);light.style.setProperty('--ly',`${(y-r.y)/r.height*100}%`);
      light.style.opacity=button===source?'1':String(Math.max(0,1-distance/800)*.9);
    }
  };
  const release=()=>{
    if(!pressed) return;
    const {button,sx,sy,tx,ty}=pressed;pressed=null;
    button.classList.remove('is-liquid-pressed');button.style.removeProperty('transform');button.style.removeProperty('transform-origin');
    states.forEach(({light})=>{light.style.opacity='0';});
    if(reduced.matches||signal.aborted)return;
    const animation=button.animate(Array.from({length:26},(_,i)=>{
      const r=i===25?0:1-glassSpring(i/25);
      return {transform:`translate(${tx*r}px,${ty*r}px) scale(${1+(sx-1)*r},${1+(sy-1)*r})`,offset:i/25};
    }),{duration:500,easing:'linear'});
    animations.set(button,animation);animation.finished.then(()=>animations.delete(button),()=>{});
  };
  nav.addEventListener('pointerdown',(event)=>{
    const button=event.target.closest('[data-liquid-button="true"]');
    if(!button||event.button!==0||reduced.matches||opaque.matches||nav.dataset.liquidReady!=='true')return;
    release();animations.get(button)?.cancel();
    pressed={button,rect:button.getBoundingClientRect(),sx:1.05,sy:.93,tx:0,ty:0};
    button.classList.add('is-liquid-pressed');button.style.transform='scale(1.05,.93)';
    illuminate(button,event.clientX,event.clientY);
    const volume=document.createElement('span');volume.className='nav-volume';volume.setAttribute('aria-hidden','true');
    const r=pressed.rect;Object.assign(volume.style,{left:`${r.x+r.width/2}px`,top:`${r.y+r.height/2}px`,width:`${r.width*2.6}px`,height:`${r.height*2.6}px`});
    document.body.append(volume);effects.add(volume);
    const glow=volume.animate([{opacity:.8,transform:'translate(-50%,-50%) scale(.35)'},{opacity:0,transform:'translate(-50%,-50%) scale(1.15)'}],{duration:1400,easing:'cubic-bezier(.16,1,.3,1)'});
    glow.finished.then(()=>{volume.remove();effects.delete(volume);},()=>volume.remove());
  },{signal,passive:true});
  window.addEventListener('pointermove',(event)=>{
    if(!pressed)return;point={x:event.clientX,y:event.clientY};
    if(frame)return;
    frame=requestAnimationFrame(()=>{
      frame=0;if(!pressed||signal.aborted)return;
      const {button,rect}=pressed,dx=point.x-rect.x-rect.width/2,dy=point.y-rect.y-rect.height/2,distance=Math.hypot(dx,dy);
      const ux=distance?dx/distance:0,uy=distance?dy/distance:0,k=Math.min(.14,distance/900);
      Object.assign(pressed,{sx:1.05*(1+k),sy:.93*(1+k*.75),tx:ux*k*26,ty:uy*k*26});
      button.style.transformOrigin=`${50-ux*30}% ${50-uy*30}%`;
      button.style.transform=`translate(${pressed.tx}px,${pressed.ty}px) scale(${pressed.sx},${pressed.sy})`;
      illuminate(button,point.x,point.y);
    });
  },{signal,passive:true});
  for(const event of ['pointerup','pointercancel','blur']) window.addEventListener(event,release,{signal});
  reduced.addEventListener('change',release,{signal});opaque.addEventListener('change',release,{signal});
  signal.addEventListener('abort',()=>{
    release();cancelAnimationFrame(frame);resize.disconnect();animations.forEach((animation)=>animation.cancel());
    effects.forEach((effect)=>{effect.getAnimations().forEach((animation)=>animation.cancel());effect.remove();});
    states.forEach(({filter})=>filter.remove());
  },{once:true});
}
