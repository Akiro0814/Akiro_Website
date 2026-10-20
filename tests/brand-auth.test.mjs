import assert from 'node:assert/strict';
import test from 'node:test';
import { createFixture } from './helpers/fixture.mjs';

test('Akiro is the default administrator and explicit deployment credentials remain valid', async (t) => {
  const fixture = createFixture(t);
  const auth = await fixture.importModule('auth.mjs');
  const previousUser = process.env.ADMIN_USER;
  const previousHash = process.env.ADMIN_PASSWORD_HASH;
  t.after(() => {
    if (previousUser === undefined) delete process.env.ADMIN_USER;
    else process.env.ADMIN_USER = previousUser;
    if (previousHash === undefined) delete process.env.ADMIN_PASSWORD_HASH;
    else process.env.ADMIN_PASSWORD_HASH = previousHash;
  });
  delete process.env.ADMIN_USER;
  process.env.ADMIN_PASSWORD_HASH = auth.hashPassword('fixture-password');
  assert.equal(await auth.verifyCredentials('Akiro', 'fixture-password'), true);
  assert.equal(await auth.verifyCredentials('admin', 'fixture-password'), false);
  process.env.ADMIN_USER = 'custom-deployment';
  assert.equal(await auth.verifyCredentials('custom-deployment', 'fixture-password'), true);
  assert.equal(await auth.verifyCredentials('Akiro', 'fixture-password'), false);
});
