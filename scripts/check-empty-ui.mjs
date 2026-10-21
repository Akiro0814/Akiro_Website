// 空博客是一种可用状态；与非空功能 fixture 分开验证，不能直接跳过断言。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import { runInPublicFixture, gotoStable } from './lib/public-ui-fixture.mjs';

await runInPublicFixture(import.meta.url, { scenario: 'empty' });
const port = 4351, base = `http://127.0.0.1:${port}`;
await new Promise((resolve, reject) => {
  const probe = net.createServer(); probe.once('error', reject); probe.listen(port, '127.0.0.1', () => probe.close(resolve));
});
const server = spawn(process.execPath, ['node_modules/astro/bin/astro.mjs', 'dev', '--host', '127.0.0.1', '--port', String(port), '--ignore-lock'], { stdio: 'ignore', windowsHide: true, env: { ...process.env, ASTRO_DEV_BACKGROUND: '1' } });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 120; i++) { try { if ((await fetch(base)).ok) { ready = true; break; } } catch {} await delay(150); }
  assert.ok(ready, '空博客副本服务未启动');
  browser = await chromium.launch();
  const context = await browser.newContext({ timezoneId: 'Asia/Shanghai' });
  await context.route('**/api/**', (route) => route.fulfill({ status: 503, body: 'Empty fixture: backend unavailable' }));
  const page = await context.newPage(), errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const out = path.resolve('docs/assets/spring-ui'); fs.mkdirSync(out, { recursive: true });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const route of ['/', '/archive/', '/notes/', '/projects/', '/about/', '/friends/', '/nav/', '/search/']) {
      await gotoStable(page, base + route);
      const size = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert.ok(size.scroll <= size.width + 2, `${route}: ${JSON.stringify(size)}`);
      assert.equal(await page.locator('a[href^="/posts/"]').count(), 0);
      if (route === '/archive/') assert.match(await page.locator('main').innerText(), /0 篇文章/);
      if (route === '/projects/') assert.equal(await page.locator('[data-project-id]').count(), 0);
      if (route === '/') await page.screenshot({ path: path.join(out, `empty-${viewport.width}.png`) });
      console.log(`✓ 空博客 ${viewport.width} ${route} 无旧文章和横向溢出`);
    }
  }
  assert.deepEqual(await (await context.request.get(base + '/search.json')).json(), []);
  assert.deepEqual(errors, []);
  console.log('✓ 空搜索索引与页面脚本检查通过');
} finally {
  await browser?.close();
  if (process.platform === 'win32') await new Promise((resolve) => spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).once('exit', resolve));
  else server.kill();
}
