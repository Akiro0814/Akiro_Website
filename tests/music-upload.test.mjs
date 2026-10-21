import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { createFixture } from './helpers/fixture.mjs';
import { validateAudio } from '../admin/lib/audio-guard.mjs';

const wav = () => {
  const buffer = Buffer.alloc(46);
  buffer.write('RIFF'); buffer.writeUInt32LE(38, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8000, 24); buffer.writeUInt32LE(16000, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(2, 40);
  return buffer;
};

test('非法类型、伪音频、空文件与超过 30MB 在写文件/歌单之前拒绝', async (t) => {
  const fixture = createFixture(t);
  const music = await fixture.importModule('music.mjs');
  for (const [originalName, buffer] of [['bad.exe', wav()], ['fake.mp3', Buffer.from('not audio')], ['fake.wav', Buffer.from('RIFF')], ['empty.wav', Buffer.alloc(0)], ['large.wav', Buffer.alloc(30 * 1024 * 1024 + 1)]]) {
    assert.throws(() => music.addLocalTrack({ originalName, buffer }), /音频|类型|30MB/);
    assert.equal(fs.existsSync(path.join(fixture.root, 'data/music-files')), false);
    assert.equal(fs.existsSync(path.join(fixture.root, 'data/music.json')), false);
  }
});

test('有效 WAV 与大写扩展名可上传，重复文件复用，删除最后引用才清理文件', async (t) => {
  const fixture = createFixture(t);
  const music = await fixture.importModule('music.mjs');
  const first = music.addLocalTrack({ originalName: '音频.WAV', buffer: wav() });
  const second = music.addLocalTrack({ originalName: '再次.wav', buffer: wav() });
  assert.equal(first.fileName, second.fileName);
  const file = path.join(fixture.root, 'data/music-files', first.fileName);
  music.removeTrack(first.id); assert.ok(fs.existsSync(file));
  music.removeTrack(second.id); assert.equal(fs.existsSync(file), false);
});

test('支持的音频格式校验真实容器/帧头，拒绝只有标签的 MP3 与其他伪文件头', () => {
  const flac = Buffer.alloc(42); flac.write('fLaC'); flac[4] = 128; flac.writeUIntBE(34, 5, 3);
  const m4a = Buffer.alloc(24); m4a.writeUInt32BE(24); m4a.write('ftypM4A ', 4); m4a.write('isom', 16);
  const ogg = Buffer.alloc(36); ogg.write('OggS'); ogg[26] = 1; ogg[27] = 8; ogg.write('OpusHead', 28);
  const aac = Buffer.from([255, 241, 80, 128, 1, 31, 252, 0]);
  const mp3 = Buffer.alloc(417); Buffer.from([255, 251, 144, 0]).copy(mp3);
  for (const [ext, buffer] of [['wav', wav()], ['flac', flac], ['m4a', m4a], ['ogg', ogg], ['aac', aac], ['mp3', mp3]]) {
    assert.equal(validateAudio(buffer, `valid.${ext}`), '.' + ext);
    assert.throws(() => validateAudio(Buffer.from('not valid audio'), `invalid.${ext}`), /音频/);
  }
  assert.throws(() => validateAudio(Buffer.from('ID3\x04\x00\x00\x00\x00\x00\x00'), 'tag-only.mp3'), /音频/);
});
