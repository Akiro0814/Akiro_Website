// 前台构建与后台公开接口共用唯一合并契约，不把 README 正文或管理字段发送给访客。
export function projectUrl(value) {
  if (typeof value !== 'string' || value.includes('\\') || [...value].some((char)=>char.charCodeAt(0)<32)) return '';
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try { const url=new URL(value); return ['http:','https:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}
const clean=(value,max=200)=>String(value??'').trim().slice(0,max);
export function projectKey(value) {
  const safe=projectUrl(value);
  try {
    const url=new URL(safe);
    const segments=url.pathname.split('/').filter(Boolean);
    if(url.hostname.toLowerCase()==='github.com' && segments.length>=2) return `github:${segments[0]}/${segments[1].replace(/\.git$/i,'')}`.toLowerCase();
  } catch {}
  return safe ? `url:${safe.replace(/\/$/,'')}` : '';
}
const tags=(values)=>[...new Set((Array.isArray(values)?values:[]).map((tag)=>clean(tag,60)).filter(Boolean))].slice(0,6);

// 用紧凑的内容标记识别服务端已渲染的目录，避免首次客户端同步再销毁整组卡片。
// 该标记仅做 UI 变化判断，不用于鉴权或完整性校验。
export function projectCatalogSignature(catalog) {
  const source=JSON.stringify(catalog);
  let hash=2166136261,second=5381;
  for(let i=0;i<source.length;i++) { const code=source.charCodeAt(i);hash=Math.imul(hash^code,16777619);second=Math.imul(second,33)^code; }
  return `${source.length}:${hash>>>0}:${second>>>0}`;
}

/** @param {{config?: any, repos?: any[], managed?: any[]}} [options] 构建期与后台接受同一份项目数据契约。 */
export function buildProjectCatalog({ config={}, repos=[], managed=[] }={}) {
  const allManaged=Array.isArray(managed)?managed:[];
  const byRepo=new Map();
  for(const item of allManaged) {
    const key=(item.links||[]).map((link)=>projectKey(link.url)).find((key)=>key.startsWith('github:'));
    if(key && !byRepo.has(key)) byRepo.set(key,item);
  }
  const seen=new Set(), linked=new Set(), open=[];
  for(const repo of Array.isArray(repos)?repos:[]) {
    const href=projectUrl(repo?.html_url), id=projectKey(href);
    if(!repo?.name || !id.startsWith('github:') || repo.private || repo.fork || seen.has(id)) continue;
    const local=byRepo.get(id), override=config.projectOverrides?.[repo.name]||{};
    if(local) linked.add(local);
    seen.add(id);
    open.push({ id, title:clean(local?.title||repo.name,120), owner:clean(repo.owner?.login||config.githubUser||href.split('/')[3],80),
      description:clean(local?.subtitle||local?.description||repo.description||'开源项目。',2000),
      href, icon:clean(override.icon||'github',50), cover:projectUrl(local?.cover),
      stars:Math.max(0,Number.isFinite(Number(repo.stargazers_count))?Number(repo.stargazers_count):0),
      tags:tags([...(local?.tech||[]),...(repo.topics?.length?repo.topics:[repo.language||'GitHub'])]),
      detailHref:local?.slug?`/projects/${encodeURIComponent(local.slug)}/`:'', noteHref:projectUrl(override.article),
    });
  }
  const groups=[];
  const others=[];
  for(const local of allManaged) {
    if(linked.has(local)||!local?.slug||!local.title) continue;
    const href=(local.links||[]).map((link)=>projectUrl(link.url)).find(Boolean)||`/projects/${encodeURIComponent(local.slug)}/`;
    const id=(local.links||[]).map((link)=>projectKey(link.url)).find((key)=>key.startsWith('github:'))||projectKey(href)||`local:${local.slug}`;
    if(seen.has(id)) continue;
    seen.add(id);
    // 仓库类型由项目自身的链接确定：导入其他账号的仓库、同步暂不可用时，
    // 也属于开源项目；未知星标保留 null，不能伪装成零星标。
    const repository=id.startsWith('github:');
    (repository?open:others).push({id,title:clean(local.title,120),owner:repository?clean(id.slice(7).split('/')[0],80):clean(config.githubUser,80),description:clean(local.subtitle||local.description,2000),href,icon:repository?'github':'layers',cover:projectUrl(local.cover),stars:null,tags:tags(local.tech),detailHref:`/projects/${encodeURIComponent(local.slug)}/`,noteHref:''});
  }
  open.sort((a,b)=>(b.stars??-1)-(a.stars??-1)||a.id.localeCompare(b.id));
  if(open.length) groups.push({id:'open-source',title:'开源项目',description:'GitHub 项目与后台导入的仓库，欢迎 Star 和提建议。',items:open});
  if(others.length) groups.push({id:'managed',title:'项目作品',description:'做过的工具、应用与实验。',items:others});
  for(const [i,group] of (Array.isArray(config.projectGroups)?config.projectGroups:[]).entries()) {
    const items=[];
    for(const item of Array.isArray(group.items)?group.items:[]) {
      const href=projectUrl(item.href),id=projectKey(href);
      if(!item.title||!href||seen.has(id)) continue;
      seen.add(id);
      items.push({id,title:clean(item.title,120),owner:clean(item.owner,80),description:clean(item.description,2000),href,icon:clean(item.icon||'layers',50),cover:'',stars:null,tags:tags(item.tags),detailHref:'',noteHref:projectUrl(item.article)});
    }
    if(items.length) groups.push({id:`group-${i}`,title:clean(group.title,120),description:clean(group.description,1000),items});
  }
  return {groups,total:groups.reduce((sum,group)=>sum+group.items.length,0)};
}
