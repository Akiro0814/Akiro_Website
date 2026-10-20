import { gatewayUrl } from '../../lib/gateway.js';
import { projectUrl } from '../../lib/project-catalog.js';

const TTL=300_000;
let snapshot, until=0, pending;
export function initProjects(signal) {
  const root=document.querySelector('[data-project-catalog]');
  if(!root) return;
  const groups=root.querySelector('[data-project-groups]');
  const cardTemplate=root.querySelector('[data-project-card-template]');
  const sectionTemplate=root.querySelector('[data-project-section-template]');
  const icons=new Map([...root.querySelectorAll('[data-project-icon-template]')].map((node)=>[node.dataset.projectIconTemplate,node]));
  let rendered='';
  const link=(node,value)=>{const href=projectUrl(value);node.hidden=!href;if(!href){node.removeAttribute('href');return;}node.setAttribute('href',href);if(href.startsWith('http')){node.target='_blank';node.rel='noopener noreferrer';}else{node.removeAttribute('target');node.removeAttribute('rel');}};
  const render=(catalog)=>{
    if(signal.aborted||!root.isConnected) return;
    // 数据没变化时保留现有 DOM，避免切回标签页就重播进场、打断卡片悬停或键盘焦点。
    const signature=JSON.stringify(catalog);
    if(signature===rendered) return;
    const fragment=document.createDocumentFragment();
    for(const group of catalog.groups) {
      const section=sectionTemplate.content.firstElementChild.cloneNode(true);
      section.dataset.projectGroup=group.id;
      const heading=section.querySelector('h2');heading.id=`project-${group.id}`;heading.textContent=String(group.title||'');section.setAttribute('aria-labelledby',heading.id);
      section.querySelector('.proj-section__desc').textContent=String(group.description||'');
      for(const item of group.items) {
        const card=cardTemplate.content.firstElementChild.cloneNode(true);card.dataset.projectId=String(item.id);
        for(const [field,value] of [['title',item.title],['owner',item.owner],['description',item.description],['stars',item.stars]]) card.querySelector(`[data-project-${field}]`).textContent=String(value??'');
        card.querySelector('[data-project-stars-wrap]').hidden=item.stars===null||item.stars===undefined;
        link(card.querySelector('[data-project-href]'),item.href);link(card.querySelector('[data-project-detail]'),item.detailHref);link(card.querySelector('[data-project-note]'),item.noteHref);
        const image=card.querySelector('[data-project-cover]'), cover=projectUrl(item.cover);image.hidden=!cover;if(cover)image.src=cover;
        const icon=card.querySelector('[data-project-icon]');icon.hidden=!!cover;
        const svg=icons.get(item.icon)||icons.get('github');
        if(svg) icon.replaceChildren(svg.content.cloneNode(true));
        const tags=card.querySelector('[data-project-tags]');tags.replaceChildren(...(Array.isArray(item.tags)?item.tags:[]).map((value)=>{const tag=document.createElement('small');tag.textContent=String(value);return tag;}));
        section.querySelector('.proj-grid').append(card);
      }
      fragment.append(section);
    }
    groups.replaceChildren(fragment);
    rendered=signature;
    root.querySelector('[data-project-empty]').hidden=catalog.groups.some((group)=>group.items.length);
  };
  const refresh=async()=>{
    if(document.hidden||signal.aborted) return;
    if(until>Date.now()){if(snapshot)render(snapshot);return;}
    // 请求不绑定旧页面的 AbortSignal，Astro 快速跨页仍共享同一份响应；只对当前页面渲染。
    pending ??= fetch(gatewayUrl('/api/public/project-catalog'),{signal:AbortSignal.timeout(8000)}).then(async(response)=>{
      if(!response.ok) throw Error('项目同步暂不可用');
      const value=await response.json();
      if(!Array.isArray(value.groups)||value.groups.some((group)=>!Array.isArray(group.items))) throw Error('项目清单格式无效');
      snapshot=value;until=Date.now()+TTL;return value;
    }).finally(()=>{pending=null;});
    try{render(await pending);}catch{until=Date.now()+60_000;/* API 不可用时保留构建内容或上一份成功清单。 */}
  };
  document.addEventListener('visibilitychange',refresh,{signal});
  const timer=setInterval(refresh,TTL);
  signal.addEventListener('abort',()=>clearInterval(timer),{once:true});
  refresh();
}
