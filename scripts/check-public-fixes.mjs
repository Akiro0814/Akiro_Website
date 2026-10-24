// 只在隔离的虚构内容副本中验证公告、插图、玻璃材质与连续换页。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';
import { runInPublicFixture } from './lib/public-ui-fixture.mjs';

await runInPublicFixture(import.meta.url);
// runInPublicFixture 只允许该分支在隔离副本执行；构造旧分类验证无损合并和破图回退。
fs.writeFileSync('data/nav.json', JSON.stringify({ categories: [
  { id: 'first', name: '旧分类一', links: [{ name: '示例网站一', url: 'https://example.com/test', desc: '第一项' }] },
  { id: 'second', name: '旧分类二', links: [{ name: '示例网站二', url: 'https://example.org', desc: '第二项' }] },
] }));
const port=4359, base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['node_modules/astro/bin/astro.mjs','dev','--host','127.0.0.1','--port',String(port),'--ignore-lock'],{stdio:'ignore',windowsHide:true,env:{...process.env,ASTRO_DEV_BACKGROUND:'1'}});
let browser;
try {
  let ready=false;
  for(let i=0;i<150;i++){try{if((await fetch(base)).ok){ready=true;break;}}catch{}await delay(200);}
  assert.ok(ready,'隔离 Astro 未启动');
  browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL || undefined});
  const page=await browser.newPage({viewport:{width:1440,height:960}});
  const errors=[];
  page.on('pageerror',(error)=>errors.push(error.message));
  let showAnnouncements = true;
  await page.route('**/api/**',route=>{
    const url=new URL(route.request().url());
    const target=url.searchParams.has('r')?decodeURIComponent(Buffer.from(url.searchParams.get('r'),'base64').toString()):url.pathname;
    return route.fulfill({json:target==='/api/public/announcements'?{items:showAnnouncements ? [{id:'first',title:'第一则公告',content:'公告一'},{id:'second',title:'第二则公告',content:'公告二'}] : []}:{}});
  });
  await page.goto(`${base}/projects/`,{waitUntil:'networkidle'});
  await expect(page.locator('[data-announce-body]')).toContainText('第一则公告');
  await page.locator('[data-announce-next]').click();
  await expect(page.locator('[data-announce-body]')).toContainText('第二则公告');
  await page.locator('[data-announce-close]').click();
  await expect(page.locator('[data-announce-body]')).toContainText('第一则公告');
  assert.equal(await page.evaluate(()=>localStorage.getItem('blog-announce-dismissed')),null);
  // 模拟旧版已有的永久关闭记录，修复后不能继续屏蔽有效公告。
  await page.evaluate(()=>localStorage.setItem('blog-announce-dismissed','["first","second"]'));
  await page.reload({waitUntil:'networkidle'});
  await expect(page.locator('[data-announce-body]')).toContainText('第一则公告');
  await page.locator('[data-announce-close]').click();
  await expect(page.locator('[data-announce-body]')).toContainText('第二则公告');
  await page.locator('[data-announce-close]').click();
  await expect(page.locator('[data-announce]')).toBeHidden();
  showAnnouncements = false;
  console.log('✓ 全部公告可切换、逐条关闭，刷新可重新打开且兼容旧关闭记录');

  await page.evaluate(()=>{
    const content=document.createElement('div');content.className='post-content';content.id='alignment-fixture';
    content.innerHTML='<figure class="post-figure post-figure--right post-figure--w50"><img class="is-loaded" width="40" height="40" src="/avatars/ui-fixture.svg" /></figure>';
    document.querySelector('main').append(content);
  });
  for(const width of [1440,390]) {
    await page.setViewportSize({width,height:960});
    const aligned=await page.locator('#alignment-fixture').evaluate(el=>{
      const image=el.querySelector('img').getBoundingClientRect(),parent=el.getBoundingClientRect();
      return Math.abs(image.right-parent.right)<2;
    });
    assert.ok(aligned,`${width}px 插图靠右`);
  }
  console.log('✓ 桌面和手机图片真实边界均靠右');
  await page.setViewportSize({width:1440,height:960});
  assert.equal(await page.locator('.atlas-brand').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
  assert.ok(await page.locator('.atlas-nav__links a').first().evaluate(el=>getComputedStyle(el).backgroundColor==='rgba(0, 0, 0, 0)'));
  assert.equal(await page.locator('.proj-section').first().evaluate(el=>getComputedStyle(el).borderTopWidth),'0px');
  console.log('✓ 作者与导航无纯色填充，项目分组没有双重分割线');
  await page.route('https://example.com/favicon.ico', (route) => route.fulfill({ status: 404, body: '' }));
  await page.route('https://example.org/favicon.ico', (route) => route.fulfill({ status: 404, body: '' }));
  await page.goto(`${base}/nav/`, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('[data-nav-cat]').count(), 1);
  assert.equal(await page.locator('[data-nav-link]').count(), 2);
  assert.equal(await page.locator('[data-site-icon]').first().getAttribute('src'), 'https://example.com/favicon.ico');
  await expect(page.locator('[data-site-icon]').first()).toBeHidden();
  await page.locator('#nav-filter-input').fill('网站二');
  assert.equal(await page.locator('[data-nav-link]:visible').count(), 1);
  console.log('✓ 旧导航分类完整合并，网站图标自动生成、失败回退与筛选正常');
  await page.evaluate(()=>{window.__publicFixNavigation=true;});
  for(const href of ['/about/','/projects/','/about/','/projects/']) {
    await page.locator(`a[href="${href}"]`).first().click();
    await page.waitForURL(`${base}${href}`);
    await page.waitForTimeout(900);
    assert.equal(await page.evaluate(()=>window.__publicFixNavigation),true);
    assert.equal(await page.evaluate(()=>window.__akiroMotion.detached),0);
    assert.equal(await page.locator('main h1').evaluate(el=>Number(getComputedStyle(el).opacity)),1);
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.locator('a[href="/about/"]').first().click();
  await page.waitForURL(`${base}/about/`);
  await expect(page.locator('main h1')).toBeVisible();
  assert.equal(await page.evaluate(()=>window.__akiroMotion.smooth),false);
  assert.deepEqual(errors,[]);
  console.log('✓ 连续换页保留客户端导航、无游离动画触发器，减少动画模式正常');
} finally {await browser?.close();server.kill();}
