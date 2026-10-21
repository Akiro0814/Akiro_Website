import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFixture } from './helpers/fixture.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { startPreview } from '../scripts/preview-admin.mjs';

test('project service shares refreshes, persists public metadata, and restores it after restart', async (t) => {
  const fixture=createFixture(t);
  const {createProjectService}=await fixture.importModule('project-catalog.mjs');
  const config=()=>({githubUser:'owner'});
  const managed=()=>[{slug:'study',title:'学迹',links:[{url:'https://github.com/owner/StudyTrack'}],tech:['Kotlin'],content:'private draft'}];
  let stored={},calls=0,saves=0;
  const repos=[{name:'StudyTrack',html_url:'https://github.com/owner/StudyTrack',stargazers_count:22,owner:{login:'owner'},permissions:{admin:true}},
    {name:'New',html_url:'https://github.com/owner/New',stargazers_count:0},
    {name:'Private',html_url:'https://github.com/owner/Private',private:true}];
  const service=createProjectService({config,managed,baked:()=>[],snapshot:()=>stored,save:async(value)=>{saves++;stored=value;},readRepos:async()=>{calls++;await Promise.resolve();return repos;}});
  const [first,second]=await Promise.all([service.read(),service.read()]);
  assert.deepEqual(first,second);
  assert.equal(calls,1);
  assert.equal(saves,1);
  assert.equal(first.total,2);
  assert.equal(first.groups[0].items[0].stars,22);
  assert.equal(first.groups[0].items[0].detailHref,'/projects/study/');
  assert.equal(stored.repos.length,2);
  assert.ok(!JSON.stringify(stored).includes('permissions'));
  assert.ok(!JSON.stringify(first).includes('private draft'));
  // 模拟服务重启且 GitHub 离线，读取磁盘快照而不是退回过时的构建列表。
  const restored=createProjectService({config,managed,baked:()=>[],snapshot:()=>stored,save:async()=>{throw Error('should not save unchanged snapshot');},readRepos:async(_user,fallback)=>fallback});
  assert.deepEqual(await restored.read(),first);
});

test('switching GitHub accounts never reuses the previous account snapshot', async (t) => {
  const fixture=createFixture(t);
  const {createProjectService}=await fixture.importModule('project-catalog.mjs');
  const service=createProjectService({config:()=>({githubUser:'new-owner'}),managed:()=>[],snapshot:()=>({user:'old-owner',repos:[{name:'Old',html_url:'https://github.com/old-owner/Old'}]}),baked:()=>[],readRepos:async(_user,fallback)=>fallback});
  assert.equal((await service.read()).total,0);
});

test('public catalog works through the gateway and preserves the existing managed-project API', {timeout:30000}, async (t) => {
  const preview=startPreview({port:4419,quiet:true});
  t.after(()=>preview.stop());
  // 无效的 GitHub 用户名使请求器直接使用本机快照，确保 HTTP 回归不访问外部网络。
  const user='fixture_owner';
  fs.mkdirSync(path.join(preview.sandbox,'src','data'),{recursive:true});
  fs.writeFileSync(path.join(preview.sandbox,'src','data','site.config.json'),JSON.stringify({githubUser:user}));
  fs.writeFileSync(path.join(preview.sandbox,'data','github-projects.json'),JSON.stringify({user,repos:[{name:'Synced',html_url:`https://github.com/${user}/Synced`,stargazers_count:7,owner:{login:user}}]}));
  let ready=false;
  for(let i=0;i<80;i++){try{if((await fetch(`${preview.url}/api/public/projects`)).ok){ready=true;break;}}catch{}await delay(100);}
  assert.ok(ready);
  assert.equal((await fetch(`${preview.url}/api/public/project-catalog`)).status, 503);
  const release=path.join(preview.sandbox,'current','_published');
  fs.mkdirSync(release,{recursive:true});
  const { buildProjectCatalog }=await import('../src/lib/project-catalog.js');
  const managed=JSON.parse(fs.readFileSync(path.join(preview.sandbox,'data/projects.json'),'utf8')).projects;
  const repos=JSON.parse(fs.readFileSync(path.join(preview.sandbox,'data/github-projects.json'),'utf8')).repos;
  fs.writeFileSync(path.join(release,'state.json'),JSON.stringify({version:1,projects:managed,catalog:buildProjectCatalog({config:{githubUser:user},repos,managed})}));
  const before=await(await fetch(`${preview.url}/api/public/projects`)).json();
  assert.ok(Array.isArray(before.items));
  const target=Buffer.from(encodeURIComponent('/api/public/project-catalog')).toString('base64');
  const response=await fetch(`${preview.url}/api/_?r=${encodeURIComponent(target)}`);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  const catalog=await response.json();
  assert.equal(catalog.total,before.items.length+1);
  assert.equal(catalog.groups[0].items[0].stars,7);
  assert.deepEqual(await(await fetch(`${preview.url}/api/public/projects`)).json(),before);
});
