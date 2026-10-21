# 开发验证与发布边界

运行环境为 Node.js >=22.12.0。先执行 `npm ci`，再运行：

```powershell
npm run verify
```

此命令依次执行 ESLint、Node 回归测试、Astro 严格类型检查、真实站点构建及产物检查。也可分别运行 `npm test`、`npm run check`、`npm run build`、`npm run check:dist`。CI 在 Windows 和 Linux 上执行同一入口；本地通过不代表远端 CI 已运行。

后台视觉与交互另运行 `npm run test:admin-ui`，首次需 `npx playwright install chromium`。此命令使用独立的临时服务和生成内容，覆盖真实登录、全部后台模块导航、主题密度、各内容视图、浮层、编辑器预览与未保存保护、保存反馈、画布及手机布局，不写入正式博客数据。CI 的 `admin-ui` 作业执行同一检查。详情见 [ADMIN_VISUALS.md](ADMIN_VISUALS.md)。

`test:public-ui`、`test:ui-polish`、`test:reading-ui`、`test:project-ui` 自动创建包含 12 篇虚构文章及离线项目的临时副本；`test:empty-ui` 单独检查空博客，均不要求正式博客有内容。这些入口复制实体依赖目录，避免 Astro/Vite 缓存经 junction 触及原工作区，因此需要额外临时磁盘空间。截图默认保存在 `docs/testing/ui/`，可通过 `UI_EVIDENCE_DIR` 指定证据目录。测试会传递子进程退出状态，结束后清理副本；不会吞掉失败或自动重试导航错误。

## 回归覆盖

| 测试 | 验证内容 |
| --- | --- |
| `tests/build.test.mjs` | 搬迁后失效链接、构建失败、切换失败恢复、回滚互斥、拒绝覆盖真实目录 |
| `tests/content.test.mjs` | 中文路径、未知 frontmatter 保留、路径冲突、回收站、提交失败时保留原文 |
| `tests/store.test.mjs` | 并发读改写不丢计数、失败后队列恢复、并发直接写入、提交失败清理 |
| `tests/site-stats.test.mjs` | 数字、pv、count 三种日统计格式，零值、缺失值与北京时间换日 |
| `tests/published-content.test.mjs` | 真实 Astro 构建下中文 URL、图注、草稿隔离、配置读取、删除后重新发布不复活 |
| `tests/published-stats.test.mjs` | 未发布/删除/构建失败不改变公开计数；双方向回滚跟随当前发布快照 |
| `tests/music-upload.test.mjs` | 音频类型、内容头、截断/空/超限拒绝且不落盘，合法文件去重与引用删除 |
| `tests/admin-api.test.mjs` | 真实 HTTP 鉴权/CSRF、缺日期与伪音频拒绝、非法路径 400、公开发布计数 |
| `tests/public-ui-fixture.test.mjs` | 空/正常夹具不复制真实内容、媒体及凭据，依赖写入不污染源目录 |
| `scripts/check-dist.mjs` | 字体分片、脚本打包、开发残留、主题与 API 哨兵、搜索 URL 对应实际产物 |

测试复制必要模块到项目内 `.test-tmp-*` 隔离目录，使用人工数据，不修改真实文章或动态数据。测试备份关闭，GitHub 自动同步关闭；退出时校验路径并清理隔离目录。`npm run verify` 的最后一次构建仍会读取真实站点内容并生成 `dist/`，不会切换 `current` 或推送备份。

## 数据生效时间

文章、随笔、项目详情、主页及关于页文案、页脚、前端公开环境变量均在构建时生成，修改后需要重新发布。网址导航、评论、友链、音乐、公告和访问统计通过后台接口即时读取。首页统计在接口不可用时保留构建时快照；纯静态预览不能代替动态接口验证。

公开接口的文章数量以 `current/search.json` 中的已发布文章为准，保存未发布不会提前增加，回滚后立即跟随对应 release；首次发布前为 0。后台源内容列表仍显示待发布内容，评论/访问量保持实时，不随静态版本回滚。随笔日期为服务端必填，不能通过清空日期保存出无法构建的 Markdown。网址导航运行时数据由 `site-info` 更新；顶部页面入口等 profile 配置仍需发布。

JSON 与 Markdown 使用同目录唯一临时文件后重命名提交。JSON 读改写需要调用 `updateJSON` 才能避免丢失更新；直接写入保证完整替换，不合并数据。队列只覆盖单个 Node 进程，因此当前文件存储部署按单后台进程运行。

## 本地发布与搬迁

`npm run deploy` 与后台发布按钮调用同一流水线。Linux 使用原子替换软链接；Windows 使用 junction，旧链接挪开到新链接就位之间有短暂空窗，切换失败时尝试恢复旧链接。搬迁后的失效 junction 可由重新发布替换；如果 `current` 是真实目录，发布会拒绝覆盖，需先检查其中内容。

仅验证本地发布且不触发远端备份时，在 PowerShell 当前终端执行：

```powershell
$env:BACKUP_ENABLED = 'false'
npm run deploy
Remove-Item Env:BACKUP_ENABLED
```

不要覆盖已有环境设置；若原先设置过该变量，请在验证后还原。发布后运行 `npm run admin`，从 `http://localhost:4000/` 查看发布结果（端口以 `.env` 为准）。`npm run dev` 的 4321 端口用于开发源码预览。

回滚只切换静态版本，不回滚源文件和动态数据。备份在发布成功后或手动 `npm run backup` 时执行，评论等运行数据不是实时异地备份；需要按可接受的数据丢失窗口安排额外备份。恢复数据时先停止后台写入，默认不含 `.env`，须另行恢复配置再启动。
