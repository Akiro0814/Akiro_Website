import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { createFixture, PROJECT_ROOT } from './helpers/fixture.mjs';

for (const [label, bucket, expected = 12] of [['当前格式', { pv: 12, sources: {}, devices: {} }], ['旧数字格式', 12], ['旧 count 格式', { count: 12 }], ['缺失今日数据', undefined, 0], ['今日为零', { pv: 0, count: 12 }, 0]]) {
  test(`静态统计支持${label}，按北京时间换日`, (t) => {
    const { root } = createFixture(t);
    fs.mkdirSync(path.join(root, 'data'));
    fs.writeFileSync(path.join(root, 'data', 'stats.json'), JSON.stringify({ total: 50, days: { '2026-10-10': 99, '2026-10-11': bucket } }));
    const moduleUrl = pathToFileURL(path.join(PROJECT_ROOT, 'src', 'lib', 'site-content.ts')).href;
    const result = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', `
      import { getSiteStatsSnapshot } from ${JSON.stringify(moduleUrl)};
      Date.now = () => Date.parse('2026-10-10T16:00:00Z');
      console.log(JSON.stringify(getSiteStatsSnapshot()));
    `], { cwd: root, encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { since: '', comments: 0, totalViews: 50, todayViews: expected });
  });
}
