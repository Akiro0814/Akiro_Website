import path from 'node:path';

export const AUDIO_MAX_BYTES = 30 * 1024 * 1024;
const ascii = (buffer, start, end) => buffer.subarray(start, end).toString('latin1');

function wave(buffer) {
  if (buffer.length < 44 || ascii(buffer, 0, 4) !== 'RIFF' || ascii(buffer, 8, 12) !== 'WAVE') return false;
  const end = buffer.readUInt32LE(4) + 8;
  if (end > buffer.length || end < 44) return false;
  let format = false, data = false;
  for (let offset = 12; offset + 8 <= end;) {
    const length = buffer.readUInt32LE(offset + 4), next = offset + 8 + length;
    if (next > end) return false;
    const kind = ascii(buffer, offset, offset + 4);
    if (kind === 'fmt ' && length >= 16) format = true;
    if (kind === 'data' && length > 0) data = true;
    offset = next + (length % 2);
  }
  return format && data;
}

function mpeg(buffer) {
  let offset = 0;
  // ID3 是元数据，不是音频帧；只有标签而无音频的文件同样必须拒绝。
  if (ascii(buffer, 0, 3) === 'ID3') {
    if (buffer.length < 10 || buffer.subarray(6, 10).some((n) => n > 127)) return false;
    offset = 10 + buffer.subarray(6, 10).reduce((size, n) => size * 128 + n, 0);
    if (buffer[3] === 4 && (buffer[5] & 16)) offset += 10;
  }
  if (offset + 4 > buffer.length) return false;
  const b = buffer.subarray(offset, offset + 4);
  const version = (b[1] >> 3) & 3, layer = (b[1] >> 1) & 3, rate = b[2] >> 4, sample = (b[2] >> 2) & 3;
  if (b[0] !== 255 || (b[1] & 224) !== 224 || version === 1 || layer === 0 || rate === 0 || rate === 15 || sample === 3) return false;
  const rates = version === 3
    ? { 3: [32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448], 2: [32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384], 1: [32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320] }
    : { 3: [32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256], 2: [8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160], 1: [8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160] };
  const bitrate = rates[layer][rate - 1] * 1000;
  const frequency = [44100, 48000, 32000][sample] / (version === 3 ? 1 : version === 2 ? 2 : 4);
  const padding = (b[2] >> 1) & 1;
  const frame = layer === 3 ? (Math.floor(12 * bitrate / frequency) + padding) * 4
    : Math.floor((layer === 1 && version !== 3 ? 72 : 144) * bitrate / frequency) + padding;
  return offset + frame <= buffer.length;
}

const checks = {
  '.wav': wave,
  '.mp3': mpeg,
  '.flac': (b) => b.length >= 42 && ascii(b, 0, 4) === 'fLaC' && (b[4] & 127) === 0 && b.readUIntBE(5, 3) === 34,
  '.m4a': (b) => {
    if (b.length < 24 || ascii(b, 4, 8) !== 'ftyp') return false;
    const size = b.readUInt32BE(0);
    if (size < 16 || size > b.length || size % 4 !== 0) return false;
    const brands = [ascii(b, 8, 12)];
    for (let i = 16; i + 4 <= size; i += 4) brands.push(ascii(b, i, i + 4));
    return brands.some((brand) => ['M4A ', 'M4B ', 'isom', 'iso2', 'mp41', 'mp42', 'qt  '].includes(brand));
  },
  '.ogg': (b) => {
    if (b.length < 28 || ascii(b, 0, 4) !== 'OggS' || b[4] !== 0 || b[26] === 0) return false;
    const start = 27 + b[26];
    const size = b.subarray(27, start).reduce((sum, length) => sum + length, 0);
    return start + size <= b.length && (ascii(b, start, start + 8) === 'OpusHead' || ascii(b, start, start + 7) === '\x01vorbis');
  },
  '.aac': (b) => {
    if (b.length < 7 || b[0] !== 255 || (b[1] & 246) !== 240 || ((b[2] >> 2) & 15) >= 13) return false;
    const length = ((b[3] & 3) << 11) | (b[4] << 3) | (b[5] >> 5);
    return length > ((b[1] & 1) ? 7 : 9) && length <= b.length;
  },
};

// 扩展名与内容头双重验证，且必须发生在 mkdir、文件去重和歌单写入之前。
// 这是容器/帧头检查，不替代播放器解码；浏览器仍负责处理不支持的编解码器。
export function validateAudio(buffer, originalName) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('音频文件为空');
  if (buffer.length > AUDIO_MAX_BYTES) throw new Error('音频不能超过 30MB');
  const ext = path.extname(String(originalName || '')).toLowerCase();
  if (!checks[ext]) throw new Error('不支持的音频类型（支持 mp3 / flac / wav / m4a / ogg / aac）');
  if (!checks[ext](buffer)) throw new Error('音频内容与扩展名不符或文件头损坏，已拒绝上传');
  return ext;
}
