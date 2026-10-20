import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './env.mjs';
import { readJSON, writeJSONAsync } from './store.mjs';
import { listProjects } from './projects.mjs';
import { readGithubRepos } from '../../src/lib/github-repos.js';
import { buildProjectCatalog } from '../../src/lib/project-catalog.js';

const sourceJson=(name,fallback)=>{try{return JSON.parse(fs.readFileSync(path.join(ROOT,'src','data',name),'utf8'));}catch{return fallback;}};
export function createProjectService({ readRepos=readGithubRepos, config=()=>sourceJson('site.config.json',{}), managed=listProjects,
  snapshot=()=>readJSON('github-projects.json',{}), save=(value)=>writeJSONAsync('github-projects.json',value),
  baked=()=>sourceJson('github-projects.json',[]) }={}) {
  let pending;
  return { read() {
    // 同时进入关于/项目页时共用一次刷新和原子保存，避免多个响应覆盖同一快照。
    return pending ??= (async()=>{
      const settings=config(), stored=snapshot();
      const fallback=stored.user===settings.githubUser && Array.isArray(stored.repos)?stored.repos:baked().filter((repo)=>String(repo.owner?.login||repo.full_name?.split('/')[0]||'').toLowerCase()===String(settings.githubUser||'').toLowerCase());
      const repos=await readRepos(settings.githubUser,fallback);
      // 只持久化公开卡片所需字段，不保存 GitHub 的权限、接口地址或其他响应元数据。
      const safe=repos.filter((repo)=>!repo.private).map((repo)=>({name:repo.name,html_url:repo.html_url,description:repo.description,stargazers_count:repo.stargazers_count,language:repo.language,topics:repo.topics,fork:repo.fork,owner:{login:repo.owner?.login||settings.githubUser}}));
      if(JSON.stringify(safe)!==JSON.stringify(fallback)) {
        try {await save({user:settings.githubUser,cachedAt:Date.now(),repos:safe});}
        catch {console.warn('[projects] GitHub 快照保存失败，本次公开清单仍可读取。');}
      }
      return buildProjectCatalog({config:settings,repos:safe,managed:managed()});
    })().finally(()=>{pending=null;});
  } };
}
export const projectCatalog = createProjectService();
