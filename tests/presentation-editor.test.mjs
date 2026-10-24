import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPresentationFields } from '../admin/lib/presentation-fields.mjs';
import { PRESENTATION_FIELDS } from '../src/lib/presentation.js';

test('页面文案按前台顺序标明位置，每个配置只提供一个填写入口', () => {
  const html=renderPresentationFields({},String,{heroControls:{title:'<input id="legacy-hero" />'}});
  for(const [key] of PRESENTATION_FIELDS) assert.equal(html.split(`data-presentation-key="${key}"`).length-1,1,`${key} 应只出现一次`);
  assert.match(html,/data-editor-region="hero"/);
  assert.match(html,/头像右侧第二段/);
  assert.match(html,/id="copy-writing"/);
  assert.match(html,/href="#copy-status"/);
  assert.ok(html.indexOf('legacy-hero')<html.indexOf('id="copy-writing"'),'首屏与正文区按前台从上到下排列');
});
