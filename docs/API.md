# 后台 API 参考

> 后台服务（`admin/server.mjs`）暴露的 HTTP 接口速查。鉴权列说明：
> - **公开**：无需登录，部分接口按 IP 限流（超限返回 429，`/api/public/view` 超限返回 202 静默）。
> - **会话**：需登录（`connect.sid` 会话 cookie），未登录返回 401。
> - **会话+CSRF**：写操作还要求 `X-CSRF-Token` 请求头（或 body 里的 `csrfToken`）与会话中一致。
>
> 管理接口以 JSON 为主；图片/音频上传使用二进制 body，Twikoo 使用事件协议。本地音频返回文件流。普通业务错误为 `{ "error": "中文说明" }`，Twikoo 另保留其协议响应。概览与维护入口见[文档索引](README.md)。

## 公开接口（/api/public）

所有展示接口读取 `current/_published/state.json`。后台保存、删除、审核与访客写入不会直接改变公开响应；成功构建统一切换，失败保持旧版，回滚恢复对应快照。首次完整发布前返回安全空值，项目目录返回 503，绝不回退读取待发布源数据。评论提交、点赞、访问打点与友链申请仍可实时写入运行库；公开展示等待发布。运行时长按已发布日期计算，已发布歌曲的临时播放地址允许刷新。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/public/twikoo` | Twikoo 协议评论接口：body `{ event, ... }`，事件 `COMMENT_GET`（拉评论树）/ `COMMENT_SUBMIT`（发评论/回复）/ `COMMENT_LIKE`（点赞，按 IP 哈希去重） |
| GET | `/api/public/friends` | 友链列表（仅已审核）+ 申请须知文案 |
| POST | `/api/public/friends/apply` | 提交友链申请（进待审核队列）；同 URL 重复提交视为更新 |
| GET | `/api/public/announcements` | 发布取样时启用且在有效期内的公告 |
| GET | `/api/public/projects` | 项目展示列表 |
| GET | `/api/public/projects/:slug` | 项目详情（含 Markdown 渲染正文） |
| GET | `/api/public/project-catalog` | 已发布的项目与 GitHub 统一目录 |
| GET | `/api/public/wallpapers` | 已发布壁纸清单，响应禁止缓存 |
| GET | `/api/public/wallpapers/:filename` | 读取清单内的壁纸文件；不是任意路径文件读取接口 |
| GET | `/api/public/playlist` | 自建歌单曲目（后台「音乐」模块维护） |
| GET | `/api/public/playlist/resolve/:id` | 网易云曲目播放地址重新解析（播放失败后前端调用） |
| GET | `/api/public/playlist/lyric/:id` | 网易云曲目歌词（LRC 文本，`{ lyric }`，无歌词返回空串） |
| POST | `/api/public/view` | 访问统计打点：body `{ path, title }`；失败静默返回 `{ ok: true }` |
| GET | `/api/public/site-info` | 站点信息聚合（profile + 导航 + 公告），前端少发请求 |
| GET | `/api/public/site-stats` | 运行时间、已发布文章数、评论数、总访问与今日访问（北京时间日界线） |

公开文章数读取当前发布版本的 `current/search.json`，不按源 Markdown 计数。首次发布前为 0，保存未发布不增加，回滚后跟随对应快照。

## 认证

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/login` | CSRF（无需已登录） | 先访问 `/admin/login` 获取会话与 CSRF；body `{ username, password, remember? }`，`remember: true` 签发记住令牌（界面默认勾选）；失败 401，8 次失败锁定 15 分钟 |
| POST | `/api/logout` | 会话+CSRF | 销毁会话并清除 cookie |

## 内容管理（文章 / 随笔）

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/list/:collection` | 会话 | 内容列表（`posts` / `notes`） |
| GET | `/api/entry/:collection?path=` | 会话 | 单篇内容（frontmatter + 正文） |
| POST | `/api/save/:collection` | 会话+CSRF | 保存/新建；body `{ id?, originalId?, fields, body }`；slug 自动净化（Windows 非法字符） |
| POST | `/api/delete/:collection` | 会话+CSRF | 移入回收站；body `{ id }` |
| GET | `/api/trash/:collection` | 会话 | 回收站列表 |
| POST | `/api/trash/restore` | 会话+CSRF | 恢复；body `{ collection, file }`，冲突时拒绝覆盖 |
| POST | `/api/trash/purge` | 会话+CSRF | 彻底删除；body `{ collection, file }`，或 `{ collection, all: true }` 清空 |
| POST | `/api/preview` | 会话+CSRF | Markdown → HTML 预览（前端展示前再过 DOM 白名单净化） |

文章标题必填，随笔日期必填。保存日期使用有效 ISO 日历日期；缺失或清空随笔日期会在写入前返回 400。非法内容路径/未知集合返回 400，合法路径的内容不存在返回 404。

## 媒体

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/media` | 会话 | 已上传文件列表 |
| GET | `/api/media/references?name=` | 会话 | 使用位置：scope 为 pending / trash / published，包含模块、标题、字段与编辑入口 |
| GET | `/api/media/preview/:name` | 会话 | 待发布媒体预览，禁止缓存；公开 `/uploads/` 只读 current |
| POST | `/api/upload?filename=` | 会话+CSRF | 图片上传（原始二进制 body，≤10MB）；扩展名白名单 + 文件头校验，SVG 自动剥离脚本能力；按内容哈希去重复用 |
| POST | `/api/media/delete` | 会话+CSRF | 删除文件；待发布内容或回收站仍引用时返回 409；删除源文件不影响已发布资源 |

## 动态模块管理（/api/manage）

以下写操作均需 **会话+CSRF**，读操作需 **会话**：

构建期间后台内容写操作返回 409，待构建完成重试。

| 模块 | 读 | 写 |
| --- | --- | --- |
| 页面内容 | GET `/api/manage/profile` | POST `/api/manage/profile` |
| 网址导航 | GET `/api/manage/nav` | POST `/api/manage/nav` |
| 友链 | GET `/api/manage/friends` | POST `/api/manage/friends/notice`、`/friends/save`、`/friends/review`、`/friends/delete` |
| 项目 | GET `/api/manage/projects` | POST `/api/manage/projects/save`、`/projects/delete` |
| 音乐 | GET `/api/manage/music` | POST `/api/manage/music/upload`、`/music/import-netease`（`input` 为链接/ID，可选 `type: song\|playlist` 显式指定）、`/music/update`、`/music/delete`、`/music/reorder` |
| 公告 | GET `/api/manage/announcements` | POST `/api/manage/announcements/save`、`/announcements/delete` |
| 评论 | GET `/api/manage/comments` | POST `/api/manage/comments/status`、`/comments/delete`、`/comments/reply` |
| Twikoo 完整管理 | — | POST `/api/manage/twikoo`，使用官方事件协议，继承博客会话及 CSRF |
| 访问统计 | GET `/api/manage/stats` | —（公开打点写入） |
| 仪表盘 | GET `/api/manage/dashboard` | — |
| 壁纸预览 | GET `/api/manage/wallpapers`、`/api/manage/wallpapers/:filename` | — |
| 开站日期 | GET `/api/manage/site-meta` | POST `/api/manage/site-meta`，body `{ since }` |

`POST /api/manage/music/upload` 使用原始二进制 body，查询参数含 filename，可选 title、artist、cover。最大 30MB；服务端校验 mp3/flac/wav/m4a/ogg/aac 扩展名与基础容器/帧头，不合格时不写文件或歌单。图片最大 10MB；Twikoo 请求最大 16MB。

## 构建发布与备份

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/build` | 会话+CSRF | 触发「构建并发布」（`astro build` + 原子切换）；构建中重复调用返回 409 |
| GET | `/api/build/status` | 会话 | 构建状态 / 日志 / 发布版本列表 |
| POST | `/api/build/rollback` | 会话+CSRF | 回滚页面、公开数据与媒体；构建占锁时拒绝操作，不覆盖编辑源文件与运行库 |
| GET | `/api/backup/config` | 会话 | 备份仓库配置（保存值 / 生效值 / 来源） |
| POST | `/api/backup/config` | 会话+CSRF | 保存备份仓库地址（留空回落默认来源） |

## 本地音乐文件

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/music/file/:name` | 当前 release 的已发布音频，支持单段 Range（拖动进度条）；源文件删除不影响本版播放 |

后台预听使用需登录的 `/api/manage/music-preview/file/:name`，读取待发布源音频并禁止缓存。

## 后台页面

`/admin/login`（登录）、`/admin`（仪表盘）、`/admin/posts`、`/admin/notes`（内容列表与回收站）、`/admin/media`、`/admin/build`、`/admin/site-content`、`/admin/projects`、`/admin/links`、`/admin/music`、`/admin/announcements`、`/admin/comments`、`/admin/site-stats`。旧地址 `/admin/nav-links`、`/admin/friends` 跳转至 `/admin/links`，`/admin/stats` 跳转至 `/admin/site-stats`。

`/admin/twikoo` 打开官方完整管理入口，`/admin/twikoo-panel` 为受保护的嵌入管理面板，均复用博客登录。

## 网关与错误状态

前台可通过 `/api/_` 统一派发：`X-Target`（兼容查询参数 r）为 `base64(encodeURIComponent(目标路径))`。服务端白名单仅允许本站 API/admin 目标；网关不免除会话、CSRF 或限流校验，不能代理外部 URL。

| 状态 | 常见含义 |
| --- | --- |
| 400 | 非法参数、内容校验失败、无效文件类型/内容 |
| 401 / 403 | 未登录/会话失效，或 CSRF/管理事件权限拒绝 |
| 404 | 内容、项目或媒体不存在 |
| 409 | 构建占锁或媒体仍被引用 |
| 413 | 请求超过对应上传/协议上限 |
| 416 | 音频 Range 无效 |
| 429 | 登录保护或接口限流 |
| 500 / 503 | 内部故障、构建失败或部分依赖服务不可用 |

具体接口以 `admin/server.mjs` 与 `admin/lib/routes.mjs` 为准。数据库迁移与评论协议边界见 [Twikoo 手册](TWIKOO.md)。
