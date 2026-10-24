import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGlassMap } from '../src/lib/liquid-glass.js';

test('导航使用有界胶囊折射，宽屏不会放大为文字拉伸与彩边', () => {
  for (const width of [390, 1360, 2048]) {
    const map = createGlassMap(width, 70);
    assert.ok(map.scale <= 24, '整条导航折射强度应限制为轻微的边缘弯曲');
  }
});

test('参考材质使用原仓库内缩 SDF、双 smoothStep 和折半归一化', () => {
  const map = createGlassMap(120, 60, { profile: 'reference' });
  const smooth = (a,b,x) => { const t=Math.max(0,Math.min(1,(x-a)/(b-a))); return t*t*(3-2*t); };
  const raw = [];
  for (let y=0;y<60;y++) for(let x=0;x<120;x++) {
    const ix=x/120-.5,iy=y/60-.5;
    const qx=Math.abs(ix)-.3+.6,qy=Math.abs(iy)-.2+.6;
    const d=Math.min(Math.max(qx,qy),0)+Math.hypot(Math.max(qx,0),Math.max(qy,0))-.6;
    const s=smooth(0,1,smooth(.8,0,d-.15));
    raw.push(ix*(s-1)*120,iy*(s-1)*60);
  }
  const scale=Math.max(...raw.map(Math.abs))*.5;
  assert.ok(Math.abs(map.scale-scale)<1e-5);
  const expected=new Uint8ClampedArray(raw.slice(0,2).map((v)=>(v/scale+.5)*255));
  assert.deepEqual([...map.data.slice(0,2)], [...expected]);
});

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
