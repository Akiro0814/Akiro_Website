import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { runInPublicFixture, gotoStable } from './lib/public-ui-fixture.mjs';
import { startPreview } from './preview-admin.mjs';

await runInPublicFixture(import.meta.url);
// 只改隔离副本中的虚构配置；通过真实 Astro 页面验证默认配色进入 HTML。
const profilePath = path.resolve('data/profile.json');
const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
Object.assign(profile.presentation, { defaultPalette:'ocean', wallpaperMode:'gradient' });
fs.writeFileSync(profilePath, JSON.stringify(profile));
const output = path.resolve('docs/assets/spring-ui');
fs.mkdirSync(output, { recursive:true });
const base = 'http://127.0.0.1:4337';
const server = spawn(process.execPath, ['node_modules/astro/bin/astro.mjs', 'dev', '--host', '127.0.0.1', '--port', '4337', '--ignore-lock'], { stdio:'ignore', windowsHide:true, env:{ ...process.env, ASTRO_DEV_BACKGROUND:'1' } });
const admin = startPreview({ port:4417, quiet:true });
const browser = await chromium.launch({ headless:true });
const errors = [];
let checks = 0;
const pass = (label) => { checks++; console.log(`✓ ${label}`); };
async function ready(url) {
  for (let i=0;i<160;i++) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve,250));
  }
  throw Error(`预览未就绪 ${url}`);
}
async function noOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 2, `${label}: 横向溢出 ${overflow}px`);
}
async function contrast(page) {
  return page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    const canvas = document.createElement('canvas'); canvas.width=canvas.height=1;
    const ctx = canvas.getContext('2d');
    const luminance = (color) => {
      ctx.clearRect(0,0,1,1); ctx.fillStyle=color; ctx.fillRect(0,0,1,1);
      const rgb = [...ctx.getImageData(0,0,1,1).data].slice(0,3).map((v) => v/255).map((v) => v<=.04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
      return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
    };
    const bg = luminance(style.getPropertyValue('--surface'));
    return Object.fromEntries(['--brand','--text','--text-muted','--text-faint'].map((key) => {
      const fg=luminance(style.getPropertyValue(key)); return [key,(Math.max(bg,fg)+.05)/(Math.min(bg,fg)+.05)];
    }));
  });
}
try {
  await Promise.all([ready(base),ready(`${admin.url}/admin/login`)]);
  const context = await browser.newContext({ viewport:{width:1440,height:960}, reducedMotion:'reduce' });
  await context.addInitScript(() => sessionStorage.setItem('blog-api-down-at',String(Date.now())));
  await context.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
    const style=document.createElement('style'); style.textContent='astro-dev-toolbar{display:none!important}'; document.head.append(style);
  }));
  await context.route('**/api/**', (route) => route.fulfill({ status:503, body:'QA: API disabled' }));
  await context.route('https://**', (route) => route.abort());
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await gotoStable(page,base,'.atlas-hero');
  assert.ok(!(await page.locator('.atlas-hero__bio').evaluate((el) => getComputedStyle(el).fontFamily)).includes('Smiley'), '正文应使用正体，不能被组件层装饰字体覆盖');
  assert.equal(await page.locator('html').getAttribute('data-palette'),'ocean');
  pass('新访客默认配色从站点配置进入首帧');
  await page.locator('[data-style-toggle]').click();
  for (const palette of ['ocean','berry','apricot','coral']) {
    await page.locator(`[data-palette-choice="${palette}"]`).click();
    assert.equal(await page.locator('html').getAttribute('data-palette'),palette);
    assert.equal(await page.locator(`[data-palette-choice="${palette}"]`).getAttribute('aria-pressed'),'true');
    for (const theme of ['light','dark']) {
      await page.evaluate((theme) => { document.documentElement.dataset.theme=theme; localStorage.setItem('blog-theme',theme); }, theme);
      for (const style of ['life','swiss','minimalist','glass','brutalist']) {
        await page.locator(`[data-style-choice="${style}"]`).click();
        for (const [key,ratio] of Object.entries(await contrast(page))) assert.ok(ratio>=4.5,`${palette}/${theme}/${style}/${key}: ${ratio}`);
      }
      await page.locator('[data-style-choice="life"]').click();
      await page.keyboard.press('Escape');
      await page.screenshot({ path:path.join(output,`home-${palette}-${theme}.png`) });
      await page.locator('[data-style-toggle]').click();
    }
  }
  pass('四组配色 × 五种风格 × 深浅色的文字/表面对比度均达到 4.5:1');
  await page.keyboard.press('Escape');
  await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.locator('html').getAttribute('data-palette'),'coral');
  // 从真实导航触发 Astro 客户端换页，检查偏好与根元素同步。
  await page.locator('.atlas-nav__links a[href="/archive/"]').click();
  await page.waitForURL('**/archive/');
  assert.equal(await page.locator('html').getAttribute('data-palette'),'coral');
  pass('配色在刷新及 Astro 客户端导航后保持');
  await page.locator('[data-style-toggle]').click();
  await page.locator('[data-style-reset]').click();
  assert.equal(await page.locator('html').getAttribute('data-palette'),'ocean');
  await page.keyboard.press('Escape');
  pass('恢复默认同时重置配色、风格和主题');
  for (const width of [390,768,1440]) {
    await page.setViewportSize({width,height:960});
    for (const [name,url] of [['home','/'],['archive','/archive/'],['article','/posts/fixture-0/'],['projects','/projects/'],['project','/projects/test/'],['notes','/notes/'],['nav','/nav/'],['friends','/friends/'],['about','/about/']]) {
      await gotoStable(page,base+url,name==='home'?'.atlas-hero':'main');
      await noOverflow(page,`${name}-${width}`);
      const navFits = await page.locator('.atlas-nav').evaluate((el) => el.querySelector('.atlas-nav__tools').getBoundingClientRect().right <= el.getBoundingClientRect().right + 1);
      assert.ok(navFits,`${name}-${width}: 导航工具不能被视口边缘裁切`);
      const menuLines = await page.locator('.atlas-menu-toggle>span').first().evaluate((el) => {
        const range=document.createRange(); range.selectNodeContents(el);
        return range.getClientRects().length;
      });
      assert.ok(menuLines <= 1,`${name}-${width}: 探索按钮文字不得换行（${menuLines} 行）`);
      await page.screenshot({ path:path.join(output,`${name}-${width}.png`) });
      if (name==='home' && width===1440) {
        await page.locator('#home-sections').scrollIntoViewIfNeeded();
        await page.screenshot({path:path.join(output,'home-content-1440.png')});
      }
    }
  }
  pass('9 类前台页面在 390/768/1440px 无横向溢出，截图已保存');
  await context.close();

  const adminContext = await browser.newContext({viewport:{width:1440,height:960},reducedMotion:'reduce'});
  const a = await adminContext.newPage(); a.on('pageerror',(e)=>errors.push(e.message));
  await gotoStable(a,`${admin.url}/admin/login`,'#login-form');
  await a.screenshot({path:path.join(output,'admin-login-1440.png')});
  await a.getByLabel('用户名',{exact:true}).fill('preview');
  await a.getByLabel('密码',{exact:true}).fill('visual-preview-only');
  await a.getByRole('button',{name:'登录',exact:true}).click();
  await a.waitForURL(`${admin.url}/admin`);
  await a.locator('#dash-root').waitFor();
  await a.getByRole('button',{name:'外观设置',exact:true}).click();
  for (const palette of ['ocean','berry','apricot','coral']) {
    await a.locator(`[data-palette-choice="${palette}"]`).click();
    for (const theme of ['浅色','深色']) {
      await a.getByRole('button',{name:theme,exact:true}).click();
      for (const [key,ratio] of Object.entries(await contrast(a))) assert.ok(ratio>=4.5,`后台 ${palette}/${theme}/${key}: ${ratio}`);
    }
  }
  await a.screenshot({path:path.join(output,'admin-palette-panel.png')});
  await a.getByRole('button',{name:'浅色',exact:true}).click();
  await a.getByRole('button',{name:'完成',exact:true}).click();
  await a.reload({waitUntil:'networkidle'});
  assert.equal(await a.locator('html').getAttribute('data-palette'),'coral');
  pass('后台四组配色/深浅色可选择、对比度达标、刷新持久化');
  for (const width of [390,768,1440]) {
    await a.setViewportSize({width,height:960});
    for (const route of ['', '/posts', '/posts/new', '/site-content', '/announcements']) {
      await gotoStable(a,`${admin.url}/admin${route}`,'.main');
      await noOverflow(a,`admin${route}-${width}`);
      await a.screenshot({path:path.join(output,`admin-${route.replaceAll('/','-')||'dashboard'}-${width}.png`)});
    }
  }
  const select = a.locator('[data-presentation-key="defaultPalette"]');
  await gotoStable(a,`${admin.url}/admin/site-content`,'.main');
  assert.equal(await select.locator('option').count(),5);
  await select.selectOption('berry');
  await a.locator('#profile-save').click();
  await a.waitForFunction(() => !document.getElementById('profile-save')?.disabled);
  await a.reload({waitUntil:'networkidle'});
  assert.equal(await a.locator('[data-presentation-key="defaultPalette"]').inputValue(),'berry');
  assert.equal(await a.locator('html').getAttribute('data-palette'),'coral','保存站点默认配色不能改变后台个人配色');
  pass('后台仪表盘/列表/编辑/设置/公告适配三个视口，站点默认配色五项齐全');
  assert.deepEqual(errors,[]);
  console.log(`Palette UI: ${checks} groups passed; screenshots: ${output}`);
  await adminContext.close();
} finally {
  await browser.close();
  await admin.stop();
  if(server.exitCode===null) { const stopped=new Promise((resolve)=>server.once('exit',resolve)); server.kill(); await stopped; }
}
