import { createGlassMap } from '../../lib/liquid-glass.js';

// 纹理与 DOM 无关，按尺寸复用；上限 16 项，避免换页反复同步生成和无限缓存。
const textures = new Map();
export function glassTexture(width, height) {
  const key=`${width}/${height}`;
  if(textures.has(key)) { const value=textures.get(key);textures.delete(key);textures.set(key,value);return value; }
  // 导航宽高比远大于参考演示卡片，使用 CSS 像素约束的边缘场，中心不缩放。
  const map=createGlassMap(width,height);
  const canvas=document.createElement('canvas');canvas.width=map.width;canvas.height=map.height;
  const context=canvas.getContext('2d');
  if(!context) throw Error('Canvas unavailable');
  context.putImageData(new ImageData(map.data,map.width,map.height),0,0);
  const value={href:canvas.toDataURL(),scale:map.scale};
  textures.set(key,value);
  if(textures.size>16) textures.delete(textures.keys().next().value);
  return value;
}

export function applyGlassTexture(filter, width, height) {
  const image=filter.querySelector('feImage'),texture=glassTexture(width,height);
  for(const element of [filter,image]) { element.setAttribute('width',String(width));element.setAttribute('height',String(height)); }
  image.setAttribute('href',texture.href);
  filter.querySelectorAll('feDisplacementMap').forEach((node)=>node.setAttribute('scale',String(texture.scale*Number(node.getAttribute('data-dispersion')||1))));
}
