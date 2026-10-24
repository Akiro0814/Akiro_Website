import UAParser from 'ua-parser-js';

// 原始 UA 不公开。Client Hints 仅用于补全浏览器主动提供的版本，不能视为身份凭证。
export function commentDevice(ua, hints = {}) {
  const result = new UAParser(String(ua || '').slice(0, 512)).getResult();
  let os = result.os.name || '未知系统';
  let version = result.os.version || '';
  if (hints.platform === 'Windows' && /^\d+(?:\.\d+)*$/.test(String(hints.platformVersion || ''))) {
    os = 'Windows'; version = Number(hints.platformVersion.split('.')[0]) >= 13 ? '11' : version;
  }
  // UA 缩减导致 Windows 10/11 无法区分时，不假称精确识别。
  else if (os === 'Windows' && version === '10') version = '10 / 11';
  return { os: `${os}${version ? ` ${version}` : ''}`.slice(0, 80),
    browser: `${result.browser.name || '未知浏览器'}${result.browser.major ? ` ${result.browser.major}` : ''}`.slice(0, 80) };
}
