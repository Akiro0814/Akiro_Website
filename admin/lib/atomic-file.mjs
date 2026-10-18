// 同目录独立临时文件 + rename：提交之前不修改原文件；失败后清理自己的临时文件。
// 这保证单次文件替换完整，读改写的串行化仍由 store.updateJSON 负责。
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const temporaryPath = (file) => `${file}.${process.pid}.${randomUUID()}.tmp`;
const commits = new Map();

// Windows 不允许同时替换同一目标，提交阶段按绝对路径排队；临时文件仍可并行写。
async function commit(tmp, file) {
  const key = path.resolve(file);
  const previous = commits.get(key) || Promise.resolve();
  const next = previous.then(() => fsp.rename(tmp, file), () => fsp.rename(tmp, file));
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
