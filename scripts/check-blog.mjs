// 完整博客验收入口：逐套执行，保留每套日志；任何一套失败都会令总命令失败。
// 浏览器脚本使用各自隔离副本或网络夹具，不向真实博客写入测试内容。
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const output = path.resolve('.test-tmp', 'full-audit', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(output, { recursive: true });
const steps = [
  ['verify', [npmCli, 'run', 'verify']],
  ...['admin-ui', 'admin-segments', 'public-ui', 'empty-ui', 'ui-polish', 'alignment-ui', 'managed-player', 'comments-ui', 'liquid-glass', 'reading-ui', 'project-catalog', 'admin-experience', 'admin-interactions', 'editor-improvements', 'public-fixes', 'refinement-ui'].map((name) => [name, [`scripts/check-${name}.mjs`]]),
];
const results = [];
for (const [name, args] of steps) {
  const started = Date.now();
  const log = path.join(output, `${name}.log`);
  const fd = fs.openSync(log, 'w');
  console.log(`开始 ${name}`);
  const child = spawn(process.execPath, args, { stdio: ['ignore', fd, fd], windowsHide: true });
  let timeout = false;
  const timer = setTimeout(() => {
    timeout = true;
    // Windows 必须终止所属进程树，避免 Astro/浏览器子进程占着测试端口。
    if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else child.kill('SIGTERM');
  }, 360000);
  let error;
  const code = await new Promise((resolve) => {
    child.once('error', (err) => { error = err.message; resolve(1); });
    child.once('exit', (status) => resolve(status ?? 1));
  });
  clearTimeout(timer);
  fs.closeSync(fd);
  const result = { name, code, timeout, error, seconds: Math.round((Date.now() - started) / 1000), log };
  results.push(result);
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`${code === 0 && !timeout ? '通过' : '失败'} ${name} (${result.seconds}s)：${log}`);
}
const failed = results.filter((result) => result.code !== 0 || result.timeout);
console.log(`完成：${results.length - failed.length}/${results.length} 套通过。证据：${output}`);
if (failed.length) process.exitCode = 1;
