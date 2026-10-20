// 距离自适应的一阶缓动：距离越远响应越快，接近目标时柔和收敛。
// 采用连续方程的解析解，避免硬距离限幅造成折线、骤停，也避免固定 lerp 随刷新率变速。
export function advanceCursor(current, target, dt, { duration, maxLag }) {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const distance = Math.hypot(dx, dy);
  if (dt > 80 || distance < .08) return { ...target };
  if (dt <= 0) return { ...current };
  const decay = Math.exp(-dt / duration);
  // 解 dD/dt = -D(1 + 3D/range)/duration；没有达到阈值时突然截断位置的分支。
  const remaining = distance * decay / (1 + 3 * distance / maxLag * (1 - decay));
  if (remaining < .08) return { ...target };
  const ratio = remaining / distance;
  return { x: target.x - dx * ratio, y: target.y - dy * ratio };
}
