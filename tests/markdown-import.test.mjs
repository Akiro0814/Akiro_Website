import test from 'node:test';
import assert from 'node:assert/strict';
import * as content from '../admin/lib/content.mjs';

test('Markdown 导入解析元数据、日期、正文，纯文本用一级标题作为标题', () => {
  assert.equal(typeof content.parseMarkdownImport, 'function');
  const result = content.parseMarkdownImport('\uFEFF---\ntitle: 本地文章\ndate: 2026-10-23\ntags: [技术, 写作]\ndraft: false\n---\n\n正文\n', 'test.md');
  assert.equal(result.fields.title, '本地文章');
  assert.equal(result.fields.date, '2026-10-23');
  assert.deepEqual(result.fields.tags, ['技术', '写作']);
  assert.equal(result.fields.draft, false);
  assert.equal(result.body, '正文\n');
  assert.equal(content.parseMarkdownImport('# 标题\n\n正文', 'test.md').fields.title, '标题');
});

test('Markdown 导入拒绝代码 frontmatter、超长和损坏的 YAML', () => {
  assert.equal(typeof content.parseMarkdownImport, 'function');
  assert.throws(() => content.parseMarkdownImport('---js\n({ title: process.cwd() })\n---\n'), /YAML/);
  assert.throws(() => content.parseMarkdownImport('x'.repeat(600_000)), /512/);
  assert.throws(() => content.parseMarkdownImport('---\ntitle: [broken\n---\n'), /YAML/);
});
