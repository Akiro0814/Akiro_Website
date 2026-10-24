// 内缩 SDF + 双 smoothStep 的位移场，适配自 xiaofangstudio/liquid-glass-web，
// 其折射引擎源自 Shu Ding 的 liquid-glass（MIT）。完整许可见 THIRD_PARTY_NOTICES.md。
// 按实际 CSS 像素计算胶囊，长导航与手机圆角曲率一致。
const smoothStep = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function createGlassMap(cssWidth, cssHeight, { radius = cssHeight / 2, profile = 'capsule' } = {}) {
  // 严格保留参考仓库 fragment 和归一化常数；胶囊模式继续供既有组件兼容使用。
  if (profile === 'reference') return referenceGlassMap(cssWidth, cssHeight);
  const w = Math.max(2, cssWidth), h = Math.max(2, cssHeight);
  // 一倍像素足够表现平滑位移；限制预算，避免超宽屏生成过大的 PNG。
  const ratio = Math.min(1, Math.sqrt(160000 / (w * h)));
  const width = Math.max(2, Math.floor(w * ratio)), height = Math.max(2, Math.floor(h * ratio));
  const data = new Uint8ClampedArray(width * height * 4);
  const raw = new Float32Array(width * height * 2);
  const edge = Math.min(14, h * .28, w * .28);
  const innerRadius = Math.max(0, Math.min(radius, w / 2, h / 2) - edge);
  let maximum = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const px = (x + .5) / width * w - w / 2, py = (y + .5) / height * h - h / 2;
    const qx = Math.abs(px) - (w / 2 - edge) + innerRadius;
    const qy = Math.abs(py) - (h / 2 - edge) + innerRadius;
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0), length = Math.hypot(ox, oy);
    const distance = Math.min(Math.max(qx, qy), 0) + length - innerRadius;
    const surface = smoothStep(edge, 0, distance);
    const bend = (1 - smoothStep(0, 1, surface)) * edge * .78;
    // 沿 SDF 法线采样内侧背景；中心为零，折射集中在与轮廓相符的一圈边缘。
    const nx = length ? ox / length : qx > qy ? 1 : 0;
    const ny = length ? oy / length : qx > qy ? 0 : 1;
    const i = (y * width + x) * 2;
    raw[i] = -Math.sign(px) * nx * bend;
    raw[i + 1] = -Math.sign(py) * ny * bend;
    maximum = Math.max(maximum, Math.abs(raw[i]), Math.abs(raw[i + 1]));
  }
  // SVG 位移是 scale * (channel - .5)。编码与 2*最大值严格配对，避免强位移裁切。
  const scale = maximum * 2;
  for (let i = 0, j = 0; i < data.length; i += 4, j += 2) {
    data[i] = (scale ? raw[j] / scale + .5 : .5) * 255;
    data[i + 1] = (scale ? raw[j + 1] / scale + .5 : .5) * 255;
    data[i + 2] = 128;
    data[i + 3] = 255;
  }
  return { width, height, data, scale };
}

// 参考实现的阻尼弹簧曲线，仅用于材质层的轻微回弹。
export const glassSpring = (t) => 1 - Math.exp(-5 * t) * Math.cos(9 * t);

function referenceGlassMap(cssWidth, cssHeight) {
  const w=Math.max(2,cssWidth),h=Math.max(2,cssHeight);
  const ratio=Math.min(1,Math.sqrt(160000/(w*h)));
  const width=Math.max(2,Math.floor(w*ratio)),height=Math.max(2,Math.floor(h*ratio));
  const data=new Uint8ClampedArray(width*height*4),raw=new Float64Array(width*height*2);
  let maximum=0;
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const ix=x/width-.5,iy=y/height-.5;
    const qx=Math.abs(ix)-.3+.6,qy=Math.abs(iy)-.2+.6;
    const distance=Math.min(Math.max(qx,qy),0)+Math.hypot(Math.max(qx,0),Math.max(qy,0))-.6;
    const s=smoothStep(0,1,smoothStep(.8,0,distance-.15));
    const i=(y*width+x)*2;
    raw[i]=ix*(s-1)*w; raw[i+1]=iy*(s-1)*h;
    maximum=Math.max(maximum,Math.abs(raw[i]),Math.abs(raw[i+1]));
  }
  const scale=maximum*.5;
  for(let i=0,j=0;i<data.length;i+=4,j+=2) {
    data[i]=(scale?raw[j]/scale+.5:.5)*255;
    data[i+1]=(scale?raw[j+1]/scale+.5:.5)*255;
    data[i+2]=0;data[i+3]=255;
  }
  return {width,height,data,scale};
}
