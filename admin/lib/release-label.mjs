import fs from 'node:fs';
import path from 'node:path';

// 名称只作为展示元数据，不参与目录命名。这样中文、空格甚至斜杠都不会
// 改变发布路径，回滚与清理仍然按唯一的时间戳标识工作。
export function normalizeReleaseLabel(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || /[\p{Cc}\p{Cf}]/u.test(value)) {
    throw new Error('版本名称必须为文字，且不能包含控制字符。');
  }
  const label = value.trim();
  if ([...label].length > 64) throw new Error('版本名称最多填写 64 个字符。');
  return label;
}

export function writeReleaseLabel(directory, label) {
  fs.writeFileSync(path.join(directory, '.release-meta.json'), JSON.stringify({ label: normalizeReleaseLabel(label) }), 'utf8');
}

export function readReleaseLabel(directory, fallback) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(directory, '.release-meta.json'), 'utf8'));
    return normalizeReleaseLabel(data.label) || fallback;
  } catch {
    // 旧发布没有元数据，损坏的展示信息也不能影响站点启动及回滚。
    return fallback;
  }
}
