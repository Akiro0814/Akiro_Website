import assert from 'node:assert/strict';
import { test } from 'node:test';
import { imageExtension, MAGIC_CHECKS, sanitizeSvg } from '../admin/lib/upload-guard.mjs';

test('AVIF 兼容品牌也能识别，不将普通 HEIF 当成 AVIF', () => {
  const avif = Buffer.alloc(32);
  avif.writeUInt32BE(32); avif.write('ftypmif1', 4); avif.write('mif1avif', 16);
  assert.equal(MAGIC_CHECKS['.avif'](avif), true);
  assert.equal(imageExtension(avif, '.png'), '.avif');
  avif.write('heic', 20);
  assert.equal(MAGIC_CHECKS['.avif'](avif), false);
});

test('已识别图片可纠正后缀，SVG 经净化，非图片不能因修改后缀而通过', () => {
  const jpeg = Buffer.from([255, 216, 255, 224, 0, 16]);
  assert.equal(imageExtension(jpeg, '.png'), '.jpg');
  assert.equal(imageExtension(jpeg, '.jpeg'), '.jpeg');
  assert.equal(imageExtension(Buffer.from('<html>fake</html>'), '.png'), null);
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><rect width="5" height="5"/></svg>');
  assert.equal(imageExtension(svg, '.jpg'), '.svg');
  assert.doesNotMatch(sanitizeSvg(svg).toString(), /onload|script|alert/);
});
