import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import net from 'node:net';

// 不读取、修改真实歌单：在浏览器请求层提供一段本地生成的 WAV 和公开歌单响应。
const port = 4336;
const base = `http://127.0.0.1:${port}`;
await new Promise((resolve, reject) => {
  const probe = net.createServer(); probe.once('error', reject); probe.listen(port, '127.0.0.1', () => probe.close(resolve));
});
const server = spawn(process.execPath, ['node_modules/astro/bin/astro.mjs', 'dev', '--host', '127.0.0.1', '--port', String(port), '--ignore-lock'], {
  stdio: 'ignore', windowsHide: true, env: { ...process.env, ASTRO_DEV_BACKGROUND: '1', PUBLIC_NETEASE_PLAYLIST_ID: '' },
});
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base)).ok) break; } catch {}
    if (i === 99) throw new Error('播放器隔离前台未启动');
    await delay(100);
  }
  const wav = Buffer.alloc(44 + 16000);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(16000, 40);
  for (let i = 0; i < 8000; i++) wav.writeInt16LE(Math.round(Math.sin(i * Math.PI * 2 * 220 / 8000) * 1000), 44 + i * 2);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let available = true;
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const encoded = url.searchParams.get('r') || request.headers()['x-target'];
    const target = encoded ? decodeURIComponent(Buffer.from(encoded, 'base64').toString()) : url.pathname;
    const body = target === '/api/public/playlist' ? { tracks: available ? [{ id: 'qa-local', title: '本地回归音频', artist: 'QA', url: `${base}/qa-tone.wav`, source: 'local' }] : [] } : { items: [], tracks: [] };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route('**/qa-tone.wav', (route) => route.fulfill({ status: 200, contentType: 'audio/wav', body: wav }));
  await page.goto(base);
  await page.locator('[data-music-player]').waitFor({ state: 'visible', timeout: 10000 });
  assert.equal(await page.locator('[data-music-player]').getAttribute('data-playlist-id'), '');
  await page.locator('[data-music-toggle]').click();
  await page.locator('[data-music-play]').click();
  await page.waitForFunction(() => { const audio = document.querySelector('[data-music-audio]'); return audio && !audio.paused && audio.currentTime > .02; });
  assert.equal(await page.locator('[data-music-title]').innerText(), '本地回归音频');
  console.log('✓ 无网易云 ID 也可读取后台本地歌单并实际播放生成的 WAV');
  await page.locator('[data-music-close]').click();
  available = false;
  await page.reload();
  await page.waitForTimeout(1000);
  assert.equal(await page.locator('[data-music-player]').isVisible(), false);
  console.log('✓ 后台下架全部歌曲后播放器隐藏，不回退至已撤下的旧歌单');
} finally {
  await browser?.close();
  const stop = spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  await new Promise((resolve) => stop.once('exit', resolve));
}
