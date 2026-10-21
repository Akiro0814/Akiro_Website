import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { test } from 'node:test';
import { createPublicFixture } from '../scripts/lib/public-ui-fixture.mjs';

for (const scenario of ['empty', 'normal']) {
  test(`公开 UI ${scenario} fixture 自动造数、实体依赖且不复制私人内容/凭据`, async (t) => {
    const source = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-source-'));
    t.after(() => fs.rmSync(source, { recursive: true, force: true }));
    for (const dir of ['src/content/posts', 'src/data', 'public/uploads', 'data/twikoo', 'node_modules/example']) fs.mkdirSync(path.join(source, dir), { recursive: true });
    fs.writeFileSync(path.join(source, 'src/content/posts/private.md'), 'PRIVATE_SENTINEL');
    fs.writeFileSync(path.join(source, '.env'), 'PRIVATE_CONFIG_SENTINEL');
    fs.writeFileSync(path.join(source, 'data/twikoo/private.json'), 'PRIVATE_DB_SENTINEL');
    fs.writeFileSync(path.join(source, 'public/uploads/private.png'), 'PRIVATE_MEDIA_SENTINEL');
    fs.writeFileSync(path.join(source, 'node_modules/example/index.js'), 'original dependency');
    const fixture = createPublicFixture({ sourceRoot: source, scenario });
    t.after(() => fixture.cleanup());
    assert.equal(fs.existsSync(path.join(fixture.root, '.env')), false);
    assert.equal(fs.existsSync(path.join(fixture.root, 'data/twikoo')), false);
    assert.equal(fs.existsSync(path.join(fixture.root, 'public/uploads/private.png')), false);
    const files = fs.readdirSync(path.join(fixture.root, 'src/content/posts'));
    assert.equal(files.length, scenario === 'normal' ? 12 : 0);
    assert.equal(files.includes('private.md'), false);
    assert.equal(fs.lstatSync(path.join(fixture.root, 'node_modules')).isSymbolicLink(), false);
    const dependency = path.join(fixture.root, 'node_modules/example/index.js');
    fs.writeFileSync(dependency, 'isolated mutation');
    assert.equal(fs.readFileSync(path.join(source, 'node_modules/example/index.js'), 'utf8'), 'original dependency');
    assert.equal(fs.readFileSync(path.join(source, 'src/content/posts/private.md'), 'utf8'), 'PRIVATE_SENTINEL');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(fixture.root, 'src/data/site.config.json'))).githubUser, '');
  });
}
