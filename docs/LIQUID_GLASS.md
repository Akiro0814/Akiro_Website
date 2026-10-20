# 顶部导航液态玻璃

参考 [xiaofangstudio/liquid-glass-web](https://github.com/xiaofangstudio/liquid-glass-web)，版本 `0483d4de5d2d8ada6369849de70287b7c6473db6`。折射引擎原始来源为 [shuding/liquid-glass](https://github.com/shuding/liquid-glass)，许可见根目录 `THIRD_PARTY_NOTICES.md`。

## 接入方式

沿用 Astro，不新增运行依赖。`src/lib/liquid-glass.js` 生成内缩圆角矩形 SDF 位移贴图：中心平坦、轮廓附近向内采样。与参考演示的 UV 比例不同，博客按实际 CSS 像素适配胶囊形状，让超宽导航和手机导航保持相同的圆角曲率；位移编码与 SVG scale 成对匹配，避免归一化裁切。

`Nav.astro` 的 SVG 三通道折射率为 1.025 / 1 / 0.975，形成细微边缘色散。背景层使用 `backdrop-filter: url(...)` 处理真实页面背景，导航文字与按钮不应用滤镜。按用户后续反馈，使用统一透明底色，已移除中段额外增白/压黑的横向渐变带。

`src/scripts/site/liquid-glass.js` 按导航尺寸和风格圆角生成 PNG。贴图最多 160000 像素，在尺寸/圆角变化后更新；指针移动只更新局部高光，不计算整张贴图。按压让材质层轻微变宽、压扁，松开采用参考项目的阻尼曲线回弹；导航本体和点击区域不移动。未移植演示页的悬浮镜片、拖拽惯性、背景图片或光束。

Astro 离页时取消帧任务、动画、指针监听和观察器，下一页重新绑定当前导航与滤镜。

## 降级

- 不支持 SVG 背景滤镜，或 Canvas 贴图生成受限时，使用原生高斯模糊、半透明底和高光边缘。
- 减少动态效果：保持静态折射，暂停指针高光与弹性反馈。
- 减少透明度：关闭背景滤镜，使用不透明主题底色；偏好恢复时重新启用。
- 不依赖第三方 CDN，也不会读取或复制壁纸图像到 Canvas；贴图是纯数学生成的 RG 位移数据。

## 验证

`node --test tests/liquid-glass.test.mjs` 验证中心/边缘位移、镜像对称、归一化与纹理预算。`npm run test:liquid-glass` 用真实 Chromium 检查 SDF PNG、开启/关闭折射的真实背景像素差异、五种风格与明暗主题、按压与高光、跨页、手机重建、减少动态/透明度，以及模拟不支持 SVG 时的降级。

像素检查使用临时斜纹背景，先确认重复基线截图完全相同，再确认恢复位移后截图变化；不是仅检查 CSS 属性存在。正常网站不插入这块测试背景。

截图保存在本机忽略目录 `docs/assets/spring-ui/`，包括 `liquid-glass-home.png`、`liquid-glass-dark.png`、`liquid-glass-mobile.png`、`liquid-glass-refraction-probe.png`。Firefox/Safari 实机及生产环境不在 Chromium 回归的证明范围内。
