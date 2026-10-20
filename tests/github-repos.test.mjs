import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRepoReader } from '../src/lib/github-repos.js';

test('hover prefetches share one read and cached data without requiring disk writes', async () => {
  let calls = 0;
  let time = 100;
  const repos = [{ name: 'Akiro_Website', html_url: 'https://github.com/Akiro0814/Akiro_Website', fork: false }];
  const read = createRepoReader({ now: () => time, ttl: 50, fetcher: async () => {
    calls++; return { ok: true, json: async () => repos };
  } });
  const results = await Promise.all([read('Akiro0814'), read('Akiro0814'), read('Akiro0814')]);
  assert.equal(calls, 1);
  assert.deepEqual(results, [repos, repos, repos]);
  await read('Akiro0814');
  assert.equal(calls, 1);
  time = 151;
  await read('Akiro0814');
  assert.equal(calls, 2);
});
test('unavailable GitHub keeps previous successful data and backs off repeated hover requests', async () => {
  let calls = 0;
  let time = 0;
  const repos = [{ name: 'Known project', html_url: 'https://github.com/owner/project' }];
  const read = createRepoReader({ now: () => time, ttl: 10, fetcher: async () => {
    calls++; if (calls > 1) throw new Error('offline');
    return { ok: true, json: async () => repos };
  } });
  assert.deepEqual(await read('owner'), repos);
  time = 11;
  assert.deepEqual(await read('owner'), repos);
  assert.deepEqual(await read('owner'), repos);
  assert.equal(calls, 2);
});
test('unconfigured users and invalid responses safely use supplied fallback', async () => {
  let calls = 0;
  const fallback = [{ name: 'Offline', html_url: 'https://github.com/owner/offline' }];
  const read = createRepoReader({ fetcher: async () => { calls++; return { ok: true, json: async () => ({ broken: true }) }; } });
  assert.deepEqual(await read('', fallback), fallback);
  assert.equal(calls, 0);
  assert.deepEqual(await read('owner', fallback), fallback);
});

test('用户仓库分页完整读取，后续页失败时保留整份旧清单', async () => {
  const first=Array.from({length:100},(_,i)=>({name:`repo-${i}`,html_url:`https://github.com/owner/repo-${i}`}));
  let calls=0, time=0, fail=false;
  const read=createRepoReader({now:()=>time,ttl:10,fetcher:async (url)=>{
    calls++; assert.ok(!url.includes('type=source'));
    if(url.includes('page=2')) { if(fail) return {ok:false}; return {ok:true,json:async()=>[{name:'last',html_url:'https://github.com/owner/last'}]}; }
    return {ok:true,json:async()=>first};
  }});
  const complete=await read('owner');
  assert.equal(complete.length,101);
  assert.equal(calls,2);
  time=11;fail=true;
  assert.deepEqual(await read('owner'),complete);
});
