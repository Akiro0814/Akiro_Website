import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { createFixture } from './helpers/fixture.mjs';

test('保存提交失败时原文不变，改路径的源文件仍可读，临时文件被清理', async (t) => {
  const fixture = createFixture(t);
  const content = await fixture.importModule('content.mjs');
  content.saveEntry('posts', '原文', { title: '原文' }, '必须保留的正文');
  const rename = fs.renameSync;
  t.mock.method(fs, 'renameSync', (from, to) => {
    if (String(to).endsWith('.md')) throw new Error('模拟提交失败');
    return rename(from, to);
  });
  assert.throws(() => content.saveEntry('posts', '原文', { title: '改写' }, '新正文', '原文'), /模拟提交失败/);
  assert.throws(() => content.saveEntry('posts', '新路径', { title: '改名' }, '新正文', '原文'), /模拟提交失败/);
  assert.equal(content.getEntry('posts', '原文').body.trim(), '必须保留的正文');
  assert.equal(content.getEntry('posts', '新路径'), null);
  assert.deepEqual(fs.readdirSync(path.join(fixture.root, 'src', 'content', 'posts')), ['原文.md']);
});

test('中文路径保存、编辑时保留未暴露的 frontmatter 字段', async (t) => {
  const fixture = createFixture(t);
  const content = await fixture.importModule('content.mjs');
  const saved = content.saveEntry('posts', '技术/中文标题', { title: '中文标题', date: '2026-10-11', draft: true }, '# 初稿');
  fs.writeFileSync(saved.filePath, saved.raw.replace('title:', 'custom_field: preserved\ntitle:'));
  const edited = content.saveEntry('posts', saved.id, { title: '更新标题', draft: false }, '更新正文', saved.id);
  assert.equal(edited.id, '技术/中文标题');
  assert.equal(edited.data.custom_field, 'preserved');
  assert.equal(edited.data.draft, undefined);
  assert.equal(edited.body.trim(), '更新正文');
});

test('新建或重命名冲突不覆盖已有文章', async (t) => {
  const fixture = createFixture(t);
  const content = await fixture.importModule('content.mjs');
  content.saveEntry('posts', '甲', { title: '甲' }, '甲的正文');
  content.saveEntry('posts', '乙', { title: '乙' }, '乙的正文');
  assert.throws(() => content.saveEntry('posts', '甲', { title: '覆盖' }, '错误正文'), /已存在/);
  assert.throws(() => content.saveEntry('posts', '乙', {}, '错误正文', '甲'), /已被占用/);
  assert.equal(content.getEntry('posts', '甲').body.trim(), '甲的正文');
  assert.equal(content.getEntry('posts', '乙').body.trim(), '乙的正文');
});

test('回收站能恢复中文路径和正文，路径穿越被拒绝', async (t) => {
  const fixture = createFixture(t);
  const content = await fixture.importModule('content.mjs');
  content.saveEntry('posts', '技术/恢复测试', { title: '恢复测试' }, '保留正文');
  content.deleteEntry('posts', '技术/恢复测试');
  assert.equal(content.getEntry('posts', '技术/恢复测试'), null);
  const [trash] = content.listTrash('posts');
  content.restoreTrash('posts', trash.file);
  assert.equal(content.getEntry('posts', '技术/恢复测试').body.trim(), '保留正文');
  assert.equal(content.listTrash('posts').length, 0);
  assert.throws(() => content.getEntry('posts', '../../package'), /非法/);
});
