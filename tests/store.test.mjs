import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createFixture } from './helpers/fixture.mjs';

test('JSON 同步和异步提交失败时旧数据完整，临时文件被清理', async (t) => {
  const fixture = createFixture(t);
  const store = await fixture.importModule('store.mjs');
  store.writeJSON('value.json', { count: 5 });
  t.mock.method(fs, 'renameSync', () => { throw new Error('同步提交失败'); });
  t.mock.method(fsp, 'rename', async () => { throw new Error('异步提交失败'); });
  assert.throws(() => store.writeJSON('value.json', { count: 99 }), /同步提交失败/);
  await assert.rejects(store.writeJSONAsync('value.json', { count: 99 }), /异步提交失败/);
  assert.deepEqual(store.readJSON('value.json', {}), { count: 5 });
  assert.deepEqual(fs.readdirSync(path.join(fixture.root, 'data')), ['value.json']);
});

test('并发直接写入使用独立临时文件，产物始终是完整 JSON', async (t) => {
  const fixture = createFixture(t);
  const store = await fixture.importModule('store.mjs');
  await Promise.all(Array.from({ length: 20 }, (_, index) => store.writeJSONAsync('value.json', { index, body: '完整数据'.repeat(1000) })));
  const saved = store.readJSON('value.json', null);
  assert.ok(saved.index >= 0 && saved.index < 20);
  assert.equal(saved.body, '完整数据'.repeat(1000));
  assert.deepEqual(fs.readdirSync(path.join(fixture.root, 'data')), ['value.json']);
});

test('同文件的并发读改写不丢计数', async (t) => {
  const fixture = createFixture(t);
  const store = await fixture.importModule('store.mjs');
  await Promise.all(Array.from({ length: 40 }, () => store.updateJSON('counter.json', { count: 0 }, async (data) => {
    await new Promise((resolve) => setImmediate(resolve));
    data.count += 1;
  })));
  assert.equal(store.readJSON('counter.json', {}).count, 40);
});

test('失败更新不落盘，也不阻塞队列中的后续更新', async (t) => {
  const fixture = createFixture(t);
  const store = await fixture.importModule('store.mjs');
  store.writeJSON('counter.json', { count: 5 });
  const failed = store.updateJSON('counter.json', {}, (data) => {
    data.count = 999;
    throw new Error('failed mutation');
  });
  const next = store.updateJSON('counter.json', {}, (data) => { data.count += 1; });
  await assert.rejects(failed, /failed mutation/);
  await next;
  assert.equal(store.readJSON('counter.json', {}).count, 6);
});
