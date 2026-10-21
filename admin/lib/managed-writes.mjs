// 发布先关上新写入入口，再排空已经通过鉴权的后台请求。访客打点和申请仍
// 写运行库；构建随后从独立副本读取，后续访客写入不再影响本次发布。
const pending = new Set();
export function trackManagedWrite(req, res, next) {
  let complete;
  const task = new Promise((resolve) => { complete = resolve; });
  pending.add(task);
  const finish = () => { pending.delete(task); complete(); };
  res.once('finish', finish);
  res.once('close', finish);
  next();
}
export async function drainManagedWrites() { await Promise.all([...pending]); }
