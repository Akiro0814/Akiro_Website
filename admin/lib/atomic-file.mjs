// 同目录独立临时文件 + rename：提交之前不修改原文件；失败后清理自己的临时文件。
// 这保证单次文件替换完整，读改写的串行化仍由 store.updateJSON 负责。
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const temporaryPath = (file) => `${file}.${process.pid}.${randomUUID()}.tmp`;
const commits = new Map();

async function renameWithRetry(tmp, file) {
  // Windows 索引器、杀毒软件和短暂读取会让合法的原子替换偶发 EPERM/EBUSY。
  // 始终重试同一次 rename，不删除旧目标；真正的权限/磁盘错误在有限次数后原样抛出。
  for (let attempt = 0; ; attempt++) {
    try { await fsp.rename(tmp, file); return; }
    catch (error) {
      if (attempt >= 5 || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) throw error;
      await delay(10 * 2 ** attempt);
    }
  }
}

// Windows 不允许同时替换同一目标，提交阶段按绝对路径排队；临时文件仍可并行写。
async function commit(tmp, file) {
  const key = path.resolve(file);
  const previous = commits.get(key) || Promise.resolve();
  const next = previous.then(() => renameWithRetry(tmp, file), () => renameWithRetry(tmp, file));
  commits.set(key, next);
  try {
    await next;
  } finally {
    if (commits.get(key) === next) commits.delete(key);
  }
}

export function writeFileAtomicSync(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const mode = fs.statSync(file, { throwIfNoEntry: false })?.mode;
  const tmp = temporaryPath(file);
  try {
    fs.writeFileSync(tmp, text, { encoding: 'utf8', flag: 'wx', mode });
    fs.renameSync(tmp, file);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

export async function writeFileAtomic(file, text) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  let mode;
  try {
    mode = (await fsp.stat(file)).mode;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const tmp = temporaryPath(file);
  try {
    await fsp.writeFile(tmp, text, { encoding: 'utf8', flag: 'wx', mode });
    await commit(tmp, file);
  } finally {
    await fsp.rm(tmp, { force: true });
  }
}
