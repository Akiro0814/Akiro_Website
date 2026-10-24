// 公开阅读体验回归：隔离动态接口，不写入真实评论、统计或后台数据。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import { runInPublicFixture } from './lib/public-ui-fixture.mjs';

await runInPublicFixture(import.meta.url);

const port = 4345, base = `http://127.0.0.1:${port}`;
await new Promise((resolve, reject) => { const probe = net.createServer(); probe.once('error', reject); probe.listen(port, '127.0.0.1', () => probe.close(resolve)); });
const server = spawn(process.execPath, ['node_modules/astro/bin/astro.mjs','dev','--host','127.0.0.1','--port',String(port),'--ignore-lock'], { windowsHide:true, stdio:'ignore', env:{ ...process.env, ASTRO_DEV_BACKGROUND:'1' } });
const out = path.resolve('docs/assets/spring-ui');
let browser;
const failures = [], errors = [];
async function check(label, fn) { try { await fn(); console.log(`✓ ${label}`); } catch (error) { failures.push(label); console.log(`✗ ${label}: ${error.message}`); } }
try {
  fs.mkdirSync(out, { recursive:true });
  for (let i=0;i<100;i++) { try { if ((await fetch(base)).ok) break; } catch {} await delay(150); }
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport:{width:1440,height:960} });
  await context.route('**/api/**', (route) => route.fulfill({ status:503, body:'Isolated reading test' }));
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base); await page.waitForLoadState('networkidle');
  const article = await page.locator('.atlas-writing-card a').first().getAttribute('href');
  await check('首次访问使用系统光标，外观面板与默认暖白配色正常', async () => {
    await page.locator('[data-style-toggle]').click();
    // 自定义光标已从现有产品中移除，回归应验证当前入口和系统光标，而非点击旧标签。
    assert.equal(await page.locator('[data-console-tab="cursor"],[data-cursor-setting]').count(), 0);
    assert.notEqual(await page.locator('body').evaluate((el) => getComputedStyle(el).cursor), 'none');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('html').evaluate((el) => getComputedStyle(el).getPropertyValue('--bg').trim()), '#faf9f5');
  });
  await check('目录点击能快速定位章节，重复点击和减少动画仍可用', async () => {
    await page.goto(new URL(article,base).href);
    const links = page.locator('.toc > ol > .toc__group > a');
    assert.ok(await links.count() >= 3);
    for (const index of [2,1,2]) {
      const link = links.nth(index);
      const id = decodeURIComponent((await link.getAttribute('href')).slice(1));
      await link.click(); await page.waitForTimeout(850);
      const geometry = await page.evaluate((target) => ({ top:document.getElementById(target).getBoundingClientRect().top, bottom:document.querySelector('.atlas-nav').getBoundingClientRect().bottom }), id);
      assert.ok(geometry.top >= geometry.bottom + 8 && geometry.top <= geometry.bottom + 55, JSON.stringify(geometry));
    }
    await page.emulateMedia({ reducedMotion:'reduce' });
    const id = decodeURIComponent((await links.nth(1).getAttribute('href')).slice(1));
    await links.nth(1).click(); await page.waitForTimeout(80);
    assert.ok(await page.evaluate((target) => document.getElementById(target).getBoundingClientRect().top < 150,id));
    await page.emulateMedia({ reducedMotion:'no-preference' });
    await page.screenshot({path:path.join(out,'reading-toc.png')});
  });
  await check('横向内容的裁切边缘具有渐进模糊，覆盖层不阻挡点击', async () => {
    await page.goto(base);
    const rail = page.locator('[data-progressive-viewport]').first();
    await rail.scrollIntoViewIfNeeded();
    assert.ok(await rail.locator('.progressive-blur__layer').count() >= 8);
    assert.equal(await rail.locator('.progressive-blur').first().evaluate((el) => getComputedStyle(el).pointerEvents), 'none');
    assert.ok(await rail.locator('.progressive-blur__layer').first().evaluate((el) => getComputedStyle(el).backdropFilter.includes('blur')));
    await page.mouse.move(20,900); await page.waitForTimeout(800);
    const edge = rail.locator('.progressive-blur--end');
    assert.equal(await edge.evaluate((el) => Number(getComputedStyle(el).opacity)),1);
    assert.notEqual(await rail.evaluate((el) => getComputedStyle(el).maskImage),'none','裁切内容本身也必须淡出，避免模糊后仍被矩形硬切');
    assert.notEqual(await edge.evaluate((el) => getComputedStyle(el).maskImage),'none','模糊覆盖层的上下交界也必须羽化');
    const bounds = await edge.boundingBox();
    const clip = { x:Math.floor(bounds.x + 4), y:Math.ceil(bounds.y + 50), width:Math.min(28,Math.floor(bounds.width-8)), height:80 };
    await edge.evaluate((el) => { el.style.visibility='hidden'; });
    const flat = await page.screenshot({clip,animations:'disabled'});
    assert.ok(flat.equals(await page.screenshot({clip,animations:'disabled'})), '模糊的重复基线应一致');
    await edge.evaluate((el) => { el.style.visibility=''; });
    assert.equal(flat.equals(await page.screenshot({clip,animations:'disabled'})),false,'渐进模糊必须实际影响边缘背景像素');
    // 比较同一裁切边缘的羽化与硬切版本，确认视口蒙版实际影响内容合成。
    const outerClip = { x:Math.floor(bounds.x+bounds.width-10), y:clip.y, width:8, height:80 };
    const feathered = await page.screenshot({clip:outerClip,animations:'disabled'});
    await rail.evaluate((el) => { el.style.maskImage='none'; el.style.webkitMaskImage='none'; });
    const hardCut = await page.screenshot({clip:outerClip,animations:'disabled'});
    assert.equal(feathered.equals(hardCut),false,'裁切边缘应渐隐到背景，而非保持硬切');
    await rail.evaluate((el) => { el.style.removeProperty('mask-image'); el.style.removeProperty('-webkit-mask-image'); });
    await page.screenshot({path:path.join(out,'reading-progressive-blur.png')});
    const viewport = rail.locator('[data-rail-viewport]');
    await viewport.evaluate((el) => { el.scrollLeft=(el.scrollWidth-el.clientWidth)/2; });
    await page.waitForFunction(() => {
      const root=document.querySelector('[data-progressive-viewport]');
      return root.dataset.edgeStart==='true' && root.dataset.edgeEnd==='true';
    });
    await rail.screenshot({path:path.join(out,'reading-progressive-blur-both.png')});
  });
  await check('壁纸按钮维持对比度，作者透明背景通过字边阴影保持可读', async () => {
    await page.goto(base);
    await page.locator('.atlas-button--ghost').hover();
    await page.waitForFunction(() => [...document.querySelectorAll('[data-hero-reveal]')].every((el) => Number(getComputedStyle(el).opacity) > .99));
    assert.equal(await page.locator('.atlas-button--ghost').evaluate((el) => getComputedStyle(el).color), 'rgb(250, 249, 245)');
    const brand = await page.locator('.atlas-brand').evaluate((el) => getComputedStyle(el).backgroundColor);
    assert.equal(brand,'rgba(0, 0, 0, 0)');
    assert.notEqual(await page.locator('.atlas-brand span').evaluate((el) => getComputedStyle(el).textShadow), 'none');
    const ratios = await page.evaluate(async () => {
      // Canvas 将 CSS Color 4 与 rgba 统一为像素，再分别合成在纯黑/纯白壁纸上。
      const canvas=document.createElement('canvas'); canvas.width=canvas.height=1;
      const ctx=canvas.getContext('2d');
      const rgba=(color)=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];};
      const luminance=(rgb)=>rgb.map((c)=>c/255).map((c)=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
      const values=[];
      for (const theme of ['light','dark']) {
        document.documentElement.dataset.theme=theme;
        await new Promise((resolve)=>setTimeout(resolve,400));
        for (const selector of ['.atlas-brand','.atlas-brand small','.atlas-button--ghost']) {
          const el=document.querySelector(selector), style=getComputedStyle(el);
          // 作者不再有矩形底色；对比度以紧贴字形的实色阴影边缘核对。
          const bg=rgba(selector.startsWith('.atlas-brand') ? getComputedStyle(document.documentElement).getPropertyValue('--bg') : style.backgroundColor);
          const foreground=luminance(rgba(style.color).slice(0,3));
          for (const wall of [0,255]) {
            const background=luminance(bg.slice(0,3).map((channel)=>channel*bg[3]/255+wall*(1-bg[3]/255)));
            values.push({theme,selector,ratio:(Math.max(foreground,background)+.05)/(Math.min(foreground,background)+.05)});
          }
        }
      }
      document.documentElement.dataset.theme='light';
      return values;
    });
    assert.ok(ratios.every((value)=>value.ratio>=4.5),JSON.stringify(ratios));
    await page.screenshot({path:path.join(out,'reading-contrast-home.png')});
  });
  await check('独立评论输入框轮廓清晰，手机无溢出', async () => {
    await page.goto(`${base}/notes/`);
    await page.locator('[data-cbox]').scrollIntoViewIfNeeded();
    await page.locator('.ac-fields input').first().waitFor();
    assert.equal(await page.locator('.ac-fields input').first().evaluate(el => getComputedStyle(el).borderTopWidth), '1px');
    assert.equal(await page.locator('.ac-form').count(), 1);
    await page.locator('[data-cbox]').screenshot({path:path.join(out,'reading-comments.png')});
    await page.setViewportSize({width:390,height:844}); await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= 391),true);
    await page.locator('[data-cbox]').screenshot({path:path.join(out,'reading-comments-mobile.png')});
  });
  assert.deepEqual(errors,[]);
  if (failures.length) throw Error(`${failures.length} 组失败：${failures.join('、')}`);
} finally {
  await browser?.close();
  await new Promise((resolve) => spawn('taskkill',['/PID',String(server.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'}).on('exit',resolve));
}
