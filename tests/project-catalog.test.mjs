import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProjectCatalog } from '../src/lib/project-catalog.js';

test('手动导入的 GitHub 项目不依赖账号同步结果，也进入开源项目', () => {
  const catalog=buildProjectCatalog({managed:[{slug:'imported',title:'导入项目',links:[{url:'https://github.com/another/project'}]}]});
  assert.equal(catalog.groups[0].id,'open-source');
  assert.equal(catalog.groups[0].items[0].owner,'another');
  assert.equal(catalog.groups[0].items[0].stars,null);
  assert.equal(catalog.groups[0].items[0].detailHref,'/projects/imported/');
});

test('无仓库的后台作品使用明确标题且空分类不输出', () => {
  const catalog=buildProjectCatalog({managed:[{slug:'local',title:'本地作品'}],config:{projectGroups:[{title:'空分组',items:[]}]}});
  assert.equal(catalog.groups.length,1);
  assert.equal(catalog.groups[0].title,'项目作品');
});

test('managed duplicates are identified by repository even with different primary links', () => {
  const managed=[{slug:'first',title:'First',links:[{url:'https://example.com/first'},{url:'https://github.com/owner/Repo'}]},
    {slug:'second',title:'Second',links:[{url:'https://example.com/second'},{url:'https://github.com/OWNER/repo.git'}]}];
  assert.equal(buildProjectCatalog({managed}).total,1);
  const catalog=buildProjectCatalog({managed,repos:[{name:'Repo',html_url:'https://github.com/owner/Repo'}]});
  assert.equal(catalog.total,1);
  assert.equal(catalog.groups[0].items[0].detailHref,'/projects/first/');
});

test('GitHub、后台和静态项目按同一仓库去重，保留详情与零星标', () => {
  const config={ githubUser:'Akiro0814', projectOverrides:{}, projectGroups:[{title:'资源',items:[{title:'重复',href:'https://github.com/akiro0814/StudyTrack.git'}]}] };
  const repos=[{name:'StudyTrack',html_url:'https://github.com/Akiro0814/StudyTrack',stargazers_count:22,language:'Kotlin'}, {name:'New',html_url:'https://github.com/Akiro0814/New',stargazers_count:0}, {name:'Fork',html_url:'https://github.com/Akiro0814/Fork',fork:true}];
  const managed=[{slug:'study',title:'学迹',links:[{url:repos[0].html_url}],tech:['Kotlin','Room'],cover:'/uploads/study.png',subtitle:'学习记录'}, {slug:'local',title:'本地项目',links:[],tech:[]}];
  const result=buildProjectCatalog({config,repos,managed});
  const items=result.groups.flatMap((group)=>group.items);
  assert.equal(items.length,3);
  assert.equal(items[0].stars,22);
  assert.equal(items[0].title,'学迹');
  assert.equal(items[0].detailHref,'/projects/study/');
  assert.equal(items[0].cover,'/uploads/study.png');
  assert.equal(items[1].stars,0);
  assert.equal(items[2].stars,null);
  assert.equal(new Set(items.map((item)=>item.id)).size,3);
});

test('危险外链不进入项目卡片，公开仓库列表不混入私有数据', () => {
  const result=buildProjectCatalog({config:{githubUser:'owner',projectGroups:[{title:'资源',items:[{title:'坏链接',href:'javascript:alert(1)'}]}]},repos:[{name:'private',private:true,html_url:'https://github.com/owner/private'}],managed:[]});
  assert.equal(result.groups.flatMap((group)=>group.items).length,0);
});
