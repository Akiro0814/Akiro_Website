import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trackView } from '../src/scripts/site/tracking.js';

test('统计 keepalive 请求读完响应体，不遗留浏览器未完成网络请求', async (t) => {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  t.after(() => {
    for (const [key, descriptor] of [['window', oldWindow], ['document', oldDocument]]) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const response = new Response('{"ok":true}');
  const calls = [];
  globalThis.window = { location: { pathname: '/tracking-qa/' }, __blogApi: { gateFetch: async (...args) => { calls.push(args); return response; } } };
  globalThis.document = { title: '验收', referrer: '' };
  trackView();
  await new Promise(setImmediate);
  assert.equal(calls[0][0], '/api/public/view');
  assert.equal(calls[0][1].keepalive, true);
  assert.equal(response.bodyUsed, true, '统计请求必须消费响应体，释放 keepalive 网络流');
});
