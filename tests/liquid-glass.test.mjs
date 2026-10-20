import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGlassMap } from '../src/lib/liquid-glass.js';

test('胶囊位移中心平坦、边缘对称，解码后的实际位移不被归一化裁切', () => {
  for (const width of [348, 1360]) {
    const map = createGlassMap(width, 70, { radius: 35 });
    const decode = (x, y, channel) => (map.data[(y * width + x) * 4 + channel] / 255 - .5) * map.scale;
    assert.ok(map.scale > 8 && map.scale < 40);
    assert.ok(Math.abs(decode(width / 2, 35, 0)) < .1);
    assert.ok(Math.abs(decode(width / 2, 35, 1)) < .1);
    assert.ok(decode(1, 35, 0) > 3);
    assert.ok(decode(width - 2, 35, 0) < -3);
    assert.ok(Math.abs(decode(1, 35, 0) + decode(width - 2, 35, 0)) < .2);
    assert.ok(decode(width / 2, 1, 1) > 3);
    assert.ok(decode(width / 2, 68, 1) < -3);
    assert.ok(map.data.every(Number.isFinite));
  }
});

test('不同圆角、最小尺寸和纹理预算均生成有限位移', () => {
  for (const [width, height, radius] of [[2,2,1],[390,60,0],[700,70,16],[2400,70,35]]) {
    const map = createGlassMap(width, height, { radius });
    assert.equal(map.data.length, map.width * map.height * 4);
    assert.ok(map.width * map.height <= 160000);
    assert.ok(Number.isFinite(map.scale));
    assert.ok(map.scale >= 0);
  }
});
