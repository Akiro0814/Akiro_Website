import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { addRelease, createFixture } from './helpers/fixture.mjs';

// 每个 fixture 都有自己的 ROOT；绝不构建或回滚真实博客。关闭所有远端备份。
process.env.BACKUP_ENABLED = 'false';

test('搬迁后 current 的目标不存在，也能重新构建发布', async (t) => {
  const fixture = createFixture(t);
  const old = addRelease(fixture.root, 'old', { current: true });
  fs.rmSync(old, { recursive: true });
  assert.equal(fs.existsSync(path.join(fixture.root, 'current')), false);
  const build = await fixture.importModule('build.mjs');
  const result = await build.buildAndPublish();
  assert.equal(result.ok, true);
  assert.equal(fs.realpathSync(path.join(fixture.root, 'current')), path.join(fixture.root, 'releases', result.release));
  assert.match(fs.readFileSync(path.join(fixture.root, 'current', 'index.html'), 'utf8'), /new release/);
});

test('构建失败保留原发布，释放构建锁', async (t) => {
  const fixture = createFixture(t);
  const old = addRelease(fixture.root, 'old', { current: true });
  fs.writeFileSync(path.join(fixture.root, 'fixture-build.mjs'), 'process.exit(1);');
  const build = await fixture.importModule('build.mjs');
  assert.equal((await build.buildAndPublish()).ok, false);
  assert.equal(fs.realpathSync(path.join(fixture.root, 'current')), old);
  assert.equal(build.isBuilding(), false);
  assert.equal(build.lastBuildStatus().status, 'failed');
});

test('已有构建时拒绝回滚，不改变当前发布', async (t) => {
  const fixture = createFixture(t);
  addRelease(fixture.root, '001');
  const current = addRelease(fixture.root, '002', { current: true });
  fs.mkdirSync(path.join(fixture.root, '.build-lock'));
  const build = await fixture.importModule('build.mjs');
  assert.throws(() => build.rollback(), /构建正在进行/);
  assert.equal(fs.realpathSync(path.join(fixture.root, 'current')), current);
  assert.equal(build.isBuilding(), true);
});

test('回滚切换静态版本，不改写内容和动态数据', async (t) => {
  const fixture = createFixture(t);
  const previous = addRelease(fixture.root, '001');
  addRelease(fixture.root, '002', { current: true });
  fs.mkdirSync(path.join(fixture.root, 'data'));
  fs.writeFileSync(path.join(fixture.root, 'data', 'comments.json'), '[{"id":"after-publish"}]');
  const build = await fixture.importModule('build.mjs');
  assert.equal(build.rollback(), '001');
  assert.equal(fs.realpathSync(path.join(fixture.root, 'current')), previous);
  assert.equal(fs.readFileSync(path.join(fixture.root, 'data', 'comments.json'), 'utf8'), '[{"id":"after-publish"}]');
  assert.equal(build.isBuilding(), false);
});

test('切换失败时保留旧发布并清理临时链接', async (t) => {
  const fixture = createFixture(t);
  const current = addRelease(fixture.root, 'old', { current: true });
  const build = await fixture.importModule('build.mjs');
  const rename = fs.renameSync;
  t.mock.method(fs, 'renameSync', (from, to) => {
    if (from === path.join(fixture.root, '.current-tmp') && to === path.join(fixture.root, 'current')) {
      throw new Error('simulated switch failure');
    }
    return rename(from, to);
  });
  await assert.rejects(build.buildAndPublish(), /simulated switch failure/);
  assert.equal(fs.realpathSync(path.join(fixture.root, 'current')), current);
  assert.equal(fs.lstatSync(path.join(fixture.root, '.current-tmp'), { throwIfNoEntry: false }), undefined);
  assert.equal(build.isBuilding(), false);
  assert.equal(build.lastBuildStatus().status, 'failed');
});

test('current 若为真实目录则拒绝替换，保留其内容', async (t) => {
  const fixture = createFixture(t);
  fs.mkdirSync(path.join(fixture.root, 'current'));
  fs.writeFileSync(path.join(fixture.root, 'current', 'index.html'), 'keep this directory');
  const build = await fixture.importModule('build.mjs');
  await assert.rejects(build.buildAndPublish(), /current.*不是.*链接/);
  assert.equal(fs.readFileSync(path.join(fixture.root, 'current', 'index.html'), 'utf8'), 'keep this directory');
});
