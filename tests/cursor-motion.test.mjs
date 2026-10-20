import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advanceCursor } from '../src/lib/cursor-motion.js';

const settings = { duration: 70, maxLag: 24 };
test('自适应跟随跨刷新率一致，停下后单调收敛，不发生硬阈值跳变', () => {
  const at = (hz) => {
    let state = { x: 0, y: 0 };
    for (let elapsed = 0; elapsed < 200;) {
      const dt = Math.min(1000 / hz, 200 - elapsed);
      state = advanceCursor(state, { x: 120, y: 60 }, dt, settings);
      elapsed += dt;
    }
    return state;
  };
  const reference = at(60);
  for (const hz of [120, 144, 240]) {
    const result = at(hz);
    assert.ok(Math.hypot(result.x - reference.x, result.y - reference.y) < .1);
  }
  let current = { x: 0, y: 0 };
  for (let i = 0; i < 40; i++) {
    const next = advanceCursor(current, { x: 120, y: 0 }, 16, settings);
    assert.ok(next.x >= current.x && next.x <= 120 && next.y === 0);
    current = next;
  }
  assert.ok(120 - current.x < .1);
  const below = advanceCursor({ x: 0, y: 0 }, { x: 23.99, y: 0 }, 16, settings);
  const above = advanceCursor({ x: 0, y: 0 }, { x: 24.01, y: 0 }, 16, settings);
  assert.ok(Math.abs(above.x - below.x) < .03);
});
test('远距离移动自动更快响应，长帧恢复直接归位', () => {
  const small = advanceCursor({ x: 0, y: 0 }, { x: 10, y: 0 }, 16, settings);
  const large = advanceCursor({ x: 0, y: 0 }, { x: 120, y: 0 }, 16, settings);
  assert.ok(large.x / 120 > small.x / 10);
  assert.ok(120 - large.x < 30);
  assert.deepEqual(advanceCursor({ x: 0, y: 0 }, { x: 120, y: 40 }, 200, settings), { x: 120, y: 40 });
});
