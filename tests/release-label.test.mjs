import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { normalizeReleaseLabel, readReleaseLabel, writeReleaseLabel } from '../admin/lib/release-label.mjs';

test('构建版本名称支持文字数字，留空使用自动名称，拒绝无效输入', () => {
  assert.equal(normalizeReleaseLabel('  秋日更新2026 V2.4-beta  '), '秋日更新2026 V2.4-beta');
  assert.equal(normalizeReleaseLabel(undefined), '');
  assert.equal(normalizeReleaseLabel('   '), '');
  assert.equal(normalizeReleaseLabel('秋'.repeat(64)), '秋'.repeat(64));
  for (const input of ['x'.repeat(65), '发布\n下一行', '版本\u0000', {}, 123]) {
    assert.throws(() => normalizeReleaseLabel(input), /版本名称/);
  }
});

test('名称仅作为元数据保存，旧版本与损坏文件回退到内部标识', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akiro-release-label-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.equal(readReleaseLabel(dir, 'stamp'), 'stamp');
  writeReleaseLabel(dir, '秋日2026 / V2');
  assert.equal(readReleaseLabel(dir, 'stamp'), '秋日2026 / V2');
  assert.deepEqual(fs.readdirSync(dir), ['.release-meta.json']);
  fs.writeFileSync(path.join(dir, '.release-meta.json'), '{broken');
  assert.equal(readReleaseLabel(dir, 'stamp'), 'stamp');
  writeReleaseLabel(dir, '');
  assert.equal(readReleaseLabel(dir, 'stamp'), 'stamp');
});
