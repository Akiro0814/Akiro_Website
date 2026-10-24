# 开发与测试

本页说明源码结构、数据边界和可重复的测试方法。入门与配置见 [README](../README.md)、[配置指南](CONFIGURATION.md)，服务器操作见[部署指南](DEPLOYMENT.md)。

## 架构与目录

```text
浏览器 → 静态页面 current/（开发时为 Astro dev）
       → /admin、/api、/admin-assets → Express
          ├─ Markdown / JSON / 独立评论 JSON 数据库
          └─ 构建 → dist/ → releases/<时间戳>/ → current
```

| 目录/文件 | 职责 |
| --- | --- |
| `src/pages/`、`layouts/`、`components/` | Astro 路由、布局和页面组件 |
| `src/content.config.ts`、`src/content/` | 内容 schema 与文章/随笔 Markdown |
| `src/lib/`、`src/scripts/site/` | 共享契约、内容处理与前台交互装配 |
| `src/styles/`、`public/` | 页面样式、字体和静态资源 |
| `admin/server.mjs`、`admin/views.mjs` | Express 入口、会话/CSRF、后台 HTML 模板 |
| `admin/lib/`、`admin/public/` | 文件存储、发布、评论、备份以及后台 UI |
| `data/` | 运行时 JSON、音乐文件、回收站、独立评论 JSON 数据库 |
| `scripts/`、`tests/` | 发布与维护入口、浏览器回归、Node 单元/集成测试 |
| `docs/` | 配置、部署、开发、API 与评论恢复的维护文档 |

`data/profile.json` 控制页面内容；`src/data/site.config.json` 控制站点回退与 GitHub/手动项目配置。两者不能当作同一个配置文件直接覆盖。`src/data/github-projects.json` 为构建回退，`data/github-projects.json` 为后台运行时快照。

## 内容字段

| 集合 | 路径 | 字段 |
| --- | --- | --- |
| 文章 | `src/content/posts/**/*.md` | title 必填；description、date、updated、cover、categories、tags、keywords、ai、sticky、main_color、author、draft 可选 |
| 随笔 | `src/content/notes/**/*.md` | date 必填；title、mood、tags、draft 可选 |

内容为 YAML frontmatter + Markdown。日期输入使用 ISO `YYYY-MM-DD`，可含时间；后台校验真实日历日期。categories/tags 等为列表，sticky 为数字，draft 为布尔值。后台编辑保留未在表单中暴露的既有 frontmatter 字段。

文件路径决定 URL：`src/content/posts/技术/example.md` 对应 `/posts/技术/example/`。新建/改名不得覆盖目标文件，路径不得逃出集合目录。删除先移入 `data/trash/`，恢复冲突时拒绝覆盖。

`getPublishedPosts/getPublishedNotes` 统一排除草稿。搜索索引只含公开文章元数据；RSS 只收录公开文章；sitemap 包含静态页、公开文章、分类/标签与项目详情，排除 404。随笔聚合在 `/notes/`，没有单独文章式详情页。

## 数据一致性与发布

保存文章 → 写 Markdown → Astro schema/glob → 页面及搜索/RSS/sitemap → `dist` → release → 切换 `current`。首次发布前公开文章量为 0，发布后读取 `current/search.json`，而不是源文件数。

Markdown 与 JSON 采用同目录临时文件 + 重命名提交。JSON 读改写使用 `updateJSON` 或 `withFileLock` 串行保护；直接替换不会自动合并更新。锁仅覆盖单 Node 进程，部署时不要让多个后台进程共用数据目录。

构建与回滚共用 `.build-lock`。构建先阻止新的后台内容写入并等待已进入的写请求结束，固定输入到锁目录内的独立副本。副本无 Astro 缓存，不清理正在开发使用的共享缓存。公开页面 JSON 采用字段白名单，音频和壁纸从 release 输出。评论独立使用官方实时数据库，先显后审，回复/隐藏/删除及评论计数即时更新，不随 release 回滚。回滚切换静态页面、公开页面数据与媒体；编辑源文件和运行库保持最新。Windows junction 切换存在短暂空窗，不能把它表述为与 Linux 完全相同的原子替换。

## 主要实现位置

| 能力 | 入口 |
| --- | --- |
| Markdown 读写/校验 | `admin/lib/content.mjs`、`src/content.config.ts` |
| 原子写入/队列 | `admin/lib/atomic-file.mjs`、`store.mjs` |
| 发布/回滚/备份 | `admin/lib/build.mjs`、`backup.mjs`、`published-content.mjs` |
| 音频与上传校验 | `admin/lib/music.mjs`、`audio-guard.mjs`、`upload-guard.mjs` |
| 前后台配置/项目合并 | `src/lib/presentation.js`、`project-catalog.js`、`admin/lib/site-data.mjs` |
| 前台生命周期 | `src/scripts/site/index.js`，首次 page-load 初始化，换页 after-swap 准备新帧、before-swap 清理，同一 body 只初始化一次 |
| 项目 AI / 本地 Markdown 导入 | `admin/lib/project-ai.mjs`、`admin/public/project-ai.js`；`admin/lib/content.mjs` 的 `parseMarkdownImport` |
| 后台交互/视图 | `admin/public/interface.js`、`visualizations.js`、`ui-model.js` |
| 后台材质/动效 | `admin/public/pearl.css`、`motion.js`、`login-scene.js` |
| 光标/目录/渐进模糊/玻璃 | `src/lib/cursor-settings.js`、`src/scripts/site/`、`src/components/ProgressiveBlur.astro`、`src/lib/liquid-glass.js` |

液态玻璃位移贴图预算最多 160000 像素，仅尺寸/圆角改变时重算，指针移动只更新高光。动画在离屏/隐藏时暂停，跨页取消监听器、观察器和帧任务；保留键盘焦点约束、Escape 返回触发按钮以及减少动画/透明度偏好。资源来源与许可见[第三方声明](../THIRD_PARTY_NOTICES.md)。

## 基础检查

```powershell
npm ci
npm run verify
```

`verify` 依次运行 ESLint、`node --test`、Astro check、真实构建与产物检查，任一步失败即停止后续阶段。排查时可分别运行 `npm run lint`、`npm test`、`npm run check`、`npm run build`、`npm run check:dist`。脚本退出成功不等于远端 CI 已完成。

Node 测试覆盖内容校验、原子写入/并发队列、Windows 发布与失败保留、草稿隔离、真实 Astro 构建、删除缓存、回滚计数、音频校验、HTTP 鉴权、独立评论持久化/迁移、项目缓存、壁纸与外观契约。产物检查核对字体、脚本打包、开发残留和搜索 URL 对应文件。

## 浏览器测试

需要对应 Playwright Chromium：

```powershell
npx playwright install chromium
```

| 命令 | 主要断言 |
| --- | --- |
| `npm run test:admin-ui` | 真实登录、模块导航、列表/视图、编辑与未保存保护、焦点和手机布局 |
| `npm run test:admin-interactions` | 弹层再次点击收回、媒体引用区域、列表重开、发布完成态 |
| `npm run test:editor-ui` | 页面分区跨区保存、Markdown 导入、预览图片对齐、失败保留与保存退出、导航友链、AI 预填 |
| `npm run test:public-fixes` | 多公告关闭与切换、图片对齐、透明品牌与玻璃按钮、连续换页清理 |
| `npm run test:refinement-ui` | 换页复用导航和滤镜、独立玻璃按钮交互、长网址无重叠、关于页悬停、全屏公告与 Escape |
| `npm run test:admin-segments` | 主题、密度及视图选项对齐 |
| `npm run test:public-ui` | 五种风格、三模式、导航焦点、横轨、列表/详情、手机和减少动画 |
| `npm run test:empty-ui` | 空首页/归档/随笔/项目/关于/友链/导航/搜索与空索引 |
| `npm run test:ui-polish` | 光标、字体、材质、主题、弹窗层级、设置持久化 |
| `npm run test:alignment-ui` | 后台实际保存配置、刷新与前后台字段对齐 |
| `npm run test:managed-player` | 模拟歌单与实际 WAV 播放、空歌单隐藏 |
| `npm run test:comments-ui` | 本站评论：提交、回复、审核、设备标签、设置、导入导出、删除、权限 |
| `npm run test:liquid-glass` | 位移纹理、真实像素差异、跨页、手机及滤镜降级 |
| `npm run test:reading-ui` | 目录定位、渐进模糊、对比度和评论输入布局 |
| `npm run test:project-ui` | 统一项目目录、星标、缓存刷新、离线回退 |

默认端口包括 4331、4336、4340、4343、4345、4347、4351 和 4414～4422 中的指定端口，部分入口共用端口，应顺序执行，避免端口冲突误测其他服务。

公开 UI、视觉细节、阅读页、项目页会自动创建 12 篇虚构文章和离线项目；empty-ui 创建完全空的博客。它们复制实体依赖，避免缓存经 junction 污染原目录。需要足够的临时磁盘空间，完成后清理副本。后台 UI 与评论测试也使用专用临时内容和凭据，不连接正式数据。

截图按脚本保存到 `docs/assets/admin-pearl/`、`docs/assets/spring-ui/` 或 `docs/testing/ui/`，这些生成目录均被 Git 忽略。自动隔离的公开 UI 入口可用 `UI_EVIDENCE_DIR` 修改保存位置。

CI 在 Windows/Linux 执行 verify，另在 Linux 执行 admin-ui 并上传截图；其余浏览器入口不会因 CI build 通过而自动获得验证。模拟 API/故障只证明内部逻辑，不能宣称真实 GitHub、网易云、外部数据库或通知服务可用。

## 隔离测试与清理

`verify` 最后的构建会读取当前站点并写入本机 `dist/`、`.astro` 等缓存，不切换 current。要求保持原工作区连缓存也不改变时，应复制源码和实体依赖到临时目录，排除真实 `.env`、内容、评论库、媒体、发布链接，再使用虚构数据与专用配置执行。

测试关闭远程备份，不发送真实通知；涉及保存、上传、删除、发布、回滚与恢复的操作只对副本执行。关键闭环同时核对 HTTP、落盘文件、实际发布页面/公开 API 和索引，不只检查“保存成功”。空博客、代表性数据、重启、删除缓存、并发小样本及发布失败应分别覆盖。

临时 `.test-tmp*`、旧日志、历史一次性报告及生成截图无需提交。删除前核实路径归属、没有活跃测试进程，并先断开 junction/符号链接；`.env`、`data/`、内容、上传、自定义头像/壁纸和整个 `node_modules` 不作为垃圾目录处理。依赖和运行服务保留时，不应擅自清空其使用中的文件。
