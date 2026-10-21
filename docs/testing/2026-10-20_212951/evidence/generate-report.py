import os,pathlib,json,re,collections,datetime
loc=json.loads(pathlib.Path(os.environ['TEMP'],'blog-audit-location.json').read_text(encoding='utf8'));folder=pathlib.Path(loc['report']);ev=folder/'evidence'
load=lambda f:json.loads((ev/f).read_text(encoding='utf-8-sig'))
flows=load('flows-results.json');extra=load('extra-results.json');focused=load('focused-results.json');baseline=load('baseline.json');host=load('host.json');browser=load('browser.json');entries=load('entry-results.json');seeded=load('seeded-results.json');protected=load('protection-check.json')
allrows=flows['rows']+extra['results']+focused['results']
status=collections.Counter(r['status'] for r in allrows)
fmt=lambda x:str(x).replace('|','／').replace('\n',' ').replace('\r','')
text='''# 博客项目深入测试报告

测试对象：`E:\\Project\\L1angK1NG_Website`。测试日期：2026-10-20，Asia/Shanghai（UTC+8）。基线采集于 21:29:51，主要用例执行约 21:30—21:40，收尾时间见 evidence/cleanup.json。本报告所有结论来自本次运行；未复用历史测试成绩。

## 1. 测试结论

当前项目具备正常编辑、构建发布、浏览、评论和动态模块管理的基本可用性。完全空博客与代表性数据下的桌面/移动页面均完成实测；文章保存、修改、草稿、撤回、删除、恢复、清空与重启均完成闭环。正常路径未发现持续阻断；**不能判定为无缺陷或可直接验收发布**。

共确认 **4 项产品问题：高 1、中 2、低 1**；另有 **2 项测试脚本问题**。优先处理随笔日期校验：接口会接受无法通过 Astro schema 的数据，导致后续整站构建失败。其次处理回滚后的公开文章计数不一致，以及音乐上传缺少类型与内容校验。非法内容路径目前返回 500，虽未读取目标文件，错误分类仍需修正。

适用结论限定为 Windows、本地 HTTP、单后台进程、官方 Twikoo 本地 Loki 存储与当前依赖。真实 nginx/HTTPS、线上发布、GitHub/网易云等真实远端可用性、MongoDB、外部 Twikoo、远程备份及完整灾难恢复均未验证。Firefox/WebKit 的浏览器可执行文件缺失，标为阻塞，未算通过。

测试计数采用“Node test 用例”和“脚本输出的逻辑断言组”两种粒度，分别报告；不把脚本数量当用例数，也不把复跑次数当新增覆盖。

## 2. 项目架构与数据流

### 2.1 入口与职责

- `package.json` 核实为 Astro 7.2.0 静态前台、Express 4.22.3 后台，Node ESM；不是 SSR 应用。前台入口为 `src/pages`，共享布局/组件与 `src/scripts` 处理交互。`src/content.config.ts` 使用 Astro glob 内容加载器及 schema。
- `admin/server.mjs` 是后台入口，提供登录、session、CSRF、文章/随笔编辑、上传、构建与回滚；`admin/views.mjs` 输出管理页面，`admin/public` 提供后台脚本和样式。
- `admin/lib/routes.mjs` 挂载 `/api/public/*` 与 `/api/manage/*`；管理接口统一验证唯一管理员会话，写接口验证 CSRF。没有角色表、多租户或分级权限模型。
- `/api/_` 网关解码 `X-Target` 或兼容查询参数，仅向本应用允许的 API/admin 路径派发。测试不仅请求网关，也直接请求业务 API。
- `.env.example` 提供必要变量契约；本次未读取或复制真实 `.env`，没有使用原管理员凭据。所有自编测试的账号、密码哈希与 session 密钥在运行时随机生成，不写入报告。

### 2.2 存储与生效规则

| 模块 | 实际存储/来源 | 保存到公开展示的路径 | 生效规则 |
| --- | --- | --- | --- |
| 文章/随笔 | `src/content/posts/**/*.md`、`src/content/notes/**/*.md` | save API → Markdown → Astro glob/schema → HTML、分类标签、搜索/RSS/sitemap | 生产静态页需构建发布；dev 是源码视图，不能充当已发布证明 |
| 草稿 | frontmatter `draft` | `getPublishedPosts/getPublishedNotes` 统一过滤 | 构建时排除，公开文章路由也不生成 |
| 站点品牌/个人资料/首页/关于/页脚/默认外观 | `data/profile.json`；部分回退取 `src/data/site.config.json` | profile API → 文件 → `src/lib/site-content.ts` → 布局与页面 | 主要展示需构建发布；`site-info` API 会先返回最新文件值 |
| 项目 | `data/projects.json` + `src/data/site.config.json` 项目组 + GitHub 公开元数据 | projects API → JSON；统一 catalog → 项目/关于列表；Astro 生成详情页 | catalog/星标可运行时更新；项目详情和 sitemap 需重建 |
| GitHub 缓存 | `data/github-projects.json` 运行时快照；`src/data/github-projects.json` 构建回退 | 共用合并契约，去重、星标排序、私有/fork 过滤 | 5 分钟缓存，失败保留完整旧快照；构建读取器不回写源码 |
| 导航 | `data/nav.json` | manage/nav → JSON → public/site-info → 前台脚本 | 网址导航数据运行时读取；顶部页面入口属于 profile，需构建 |
| 友链 | `data/friends.json` | 申请 → pending → 审核 → public/friends → 友链 UI | 只公开 approved；无需构建 |
| 公告 | `data/announcements.json` | 保存 → enabled/有效期过滤 → public/site-info/announcements | 运行时生效 |
| 音乐 | `data/music.json`、`data/music-files/`；可选网易云/Meting | 管理 API → 公开 playlist → `/api/music/file/:name` Range 流 → Audio | 无需构建；空歌单隐藏播放器 |
| 图片/壁纸 | `public/uploads/`、`public/wallpapers/` | 图片上传校验/去重 → 引用；壁纸 API 每次读取目录 | 新静态快照应随发布携带；后台 public 静态服务与壁纸 API 可实时访问 |
| 评论 | 官方 `twikoo` / `tkserver` / `@twikoojs/common` 2.0.15；默认 `data/twikoo/` Loki 数据库 | SDK → public/twikoo → 本地服务 → 同库管理审核/回复/删除 | 实时；旧 comments.json 为幂等迁移来源，不是新评论主库 |
| 访问量/公开统计 | `data/stats.json`、site-meta、Twikoo 统计摘要等 | public/view → 原子 JSON；site-stats 聚合 | 实时；文章量当前按源 Markdown 计算，造成 R-02 |
| 回收站 | `data/trash/posts`、`data/trash/notes` | delete → 移出内容目录 → restore/purge | 源文件立即变动，已发布静态页仍需重建 |

搜索索引仅收录公开文章的标题、摘要、分类、标签和关键词，不是全文检索。RSS 仅包含公开文章；随笔没有独立详情 feed。sitemap 包含静态页面、公开文章、项目详情和分类标签，排除 404。

### 2.3 构建、发布、缓存、备份

`buildAndPublish` 获取 `.build-lock` → 必要时清理 Astro 内容缓存 → `npm run build` → `dist` 移至时间戳 `releases` → 切换 `current` → 保存构建状态/内容清单 → 按配置备份。Windows 使用 junction 与旧链接恢复策略；保留旧 release，具体数量由源码常量决定。

`.content-build-manifest.json` 记录源内容路径。检测到删除时清理 `.astro` 等内容缓存，防止“源 Markdown 已删但旧内容复活”。本次 DATA-07 记录 `cacheRebuilt=true`，产物、索引和重启结果均为空。

回滚只切换静态版本，不恢复 Markdown、动态 JSON 或评论数据库；这本身是源码设计。问题在于公开统计仍把当前源文件当作已发布文章量，用户会看到与回滚页面不一致的数字。回滚不应在未授权的情况下恢复运行时评论/访问数据。

备份按源码可打包个人数据并推送私人 Git 仓库，远端配置及是否包含环境文件受独立开关控制。本次所有构建的 BACKUP_ENABLED=false，构建日志明确显示跳过，没有操作真实远程仓库。全库恢复没有管理端“一键恢复”接口，不能把回收站恢复称为完整备份恢复。

## 3. 测试环境与隔离

'''
text+=f'''| 项目 | 本次基线 |
| --- | --- |
| 提交 | `{baseline['head']}` |
| 原工作区改动 | 修改 data/announcements.json、data/profile.json、src/data/github-projects.json、src/data/site.config.json；删除 public/avatars/avatar.jpg |
| Node / npm | {browser['node']} / 11.17.0 |
| 系统 / PowerShell | {host['OS']} / {host['PowerShell']} |
| 时区 | Asia/Shanghai；系统 {host['TimeZone']}；浏览器显式 Asia/Shanghai |
| 实际浏览器 | Chromium {browser['chromium']}，Playwright {browser['playwright']}，headless |
| 核心依赖 | Astro 7.2.0、Express 4.22.3、express-session 1.19.0、Twikoo/tkserver/common 2.0.15；完整版本见 dependencies.json |
| 独立服务端口 | 4520 后台，4521 静态站/同源代理；补充与复现 4540 |
| 原有脚本端口 | 4331、4336、4340、4343、4345、4347、4414、4416、4418、4422；串行运行避免冲突 |
| 副本 | `{loc['sandbox']}` 与 `{loc['flows']}`；已清理 |
| 数据保护 | 20 个真实业务文件 SHA-256 与文件集合前后完全一致；实际 Markdown 数量始终为 0 |

'''
text+='''复制采用当前文件系统，包含所有未提交改动及已有 `.astro`/`dist`，没有使用 git checkout/HEAD 生成旧源码；排除真实 `.env`、评论库、发布 junction、Git 元数据和旧测试目录。依赖通过 `node_modules` junction 复用，产品源码与业务数据均为实体副本。发布/上传/统计/评论只发生在副本。未修改业务代码、UI 或依赖，也未提交、推送或部署。

现有脚本事先审查：单元测试使用独立 fixture；admin UI 使用 `startPreview` 临时服务；公开 UI 大多拦截 `/api` 为 503；Twikoo UI 使用另一个独立官方本地库。检查固定端口与 finally 清理后再执行。自编闭环服务器通过网络 guard 阻断公网 fetch，浏览器仅允许本机地址；远程通知配置没有从真实库或环境复制。原有 mock 测试则按其注入响应执行，未把模拟响应称为第三方实网成功。

## 4. 执行汇总

“逻辑组”是脚本一条具名检查的统计单位，可能含多个断言；不是 Playwright Test runner 生成的独立 test 数。中断脚本的未到达断言组不能算通过。最终 10 个 UI 入口均在适用数据前提下通过，但第一次空博客执行的失败与一次竞态仍保留。

| 测试入口/模块 | 命令或方法 | 实际用例数 | 通过 | 失败 | 阻塞/未执行 | 耗时 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- |
'''
verify=entries[0]
text+=f"| verify | npm run verify | Node 61；另含 lint/check/build/check:dist 5 阶段 | 61，5 阶段通过 | 0 | 0 | {verify['seconds']}s | [verify.log](evidence/verify.log) |\n"
for r in entries[1:]:
 name=r['script'];log=r['log'];t=(ev/log).read_text(encoding='utf8');passes=len(re.findall('^✓',t,re.M));fails=len(re.findall('^✗',t,re.M))
 if r['exit']==0: count=f'{passes} 逻辑组';bad='0';remain='0'
 elif name=='test:ui-polish':count='14 逻辑组';bad='2';remain='0'
 else:count=f'完成 {passes} 组后中断';bad='1 个中断点';remain='后续组未执行'
 text+=f"| {name}（空博客首次） | npm run {name} | {count} | {passes} | {bad} | {remain} | {r['seconds']}s | [{log}](evidence/{log}) |\n"
for r in seeded:
 t=(ev/r['log']).read_text(encoding='utf8');n=len(re.findall('^✓',t,re.M));text+=f"| {r['script']}（样例） | 同命令，先注入固定 fixture | {n} 已完成逻辑组 | {n} | {'0' if r['exit']==0 else '1 个导航中断点'} | {'0' if r['exit']==0 else '其余组未执行'} | {r['seconds']}s | [{r['log']}](evidence/{r['log']}) |\n"
retry=load('public-retry-result.json');text+=f"| test:public-ui（原脚本重试） | npm run test:public-ui | 11 逻辑组 | 11 | 0 | 0 | {retry['seconds']:.2f}s | [retry.log](evidence/seeded-test-public-ui-retry.log) |\n"
for filename,rows in [('flows-results.json',flows['rows']),('extra-results.json',extra['results']),('focused-results.json',focused['results'])]:
 c=collections.Counter(r['status'] for r in rows);secs=sum(r.get('ms',0) for r in rows)/1000
 text+=f"| {filename} | Node + Chromium + HTTP + 文件断言 | {len(rows)} 具名用例 | {c['通过']} | {c['失败']} | {c['阻塞']} | 用例体合计 {secs:.2f}s，含服务/浏览器启动的总耗时未单独计时 | [{filename}](evidence/{filename}) |\n"
text+=f'''
自编测试合计 {len(allrows)} 个具名用例：通过 {status['通过']}、失败 {status['失败']}、阻塞 {status['阻塞']}。其中失败去重为上述 4 项产品问题；同一问题的重复方向复现不新增缺陷数。已有最终适用回归为 61 个 Node 用例 + 77 个 UI 逻辑组；不与自编用例合并计算覆盖率。

verify 具体结果：ESLint 退出 0；Node 61/61、无跳过；Astro check 0 errors / 0 warnings；空博客 build 9 页；check:dist 检查首页、字体格式、无开发残留、主题初始化、API 降级哨兵、脚本 chunk 及 0 条搜索 URL，全部通过。空集合的 glob 提示存在，未将其当作内容泄露或构建错误。

## 5. 功能覆盖矩阵

下面列出本次自编测试的实际逐例结果。所有“修改/删除”等操作的共同前置条件为隔离副本、专用管理员和有效 CSRF；EMPTY 为未注入数据，normal 为一次公开文章、一次草稿、随笔及项目/动态数据已发布。精确请求/响应见对应 JSON 的 requests 或 api 数组，代码中的断言即预期契约。

| 用例 ID | 模块 | 场景与前置条件 | 操作 | 预期 | 实际 | 状态 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- |
'''
for filename,rows in [('flows-results.json',flows['rows']),('extra-results.json',extra['results']),('focused-results.json',focused['results'])]:
 for r in rows:
  ident=r['id'];label=r['label'];module=ident.split('-')[0];actual=r.get('actual')
  if actual is None:actual='所有该组断言满足'
  elif isinstance(actual,(dict,list)):actual=json.dumps(actual,ensure_ascii=False)
  # 保留错误关键信息，栈等详细内容留在原始 JSON。
  actual=fmt(actual)[:480]
  operation='浏览器访问并检查 HTTP/DOM/溢出' if ident.startswith(('empty-','normal-')) else '按 '+ident+' 脚本步骤操作并核对底层数据'
  expected='HTTP/数据/展示与断言契约一致' if not ident.startswith('BROWSER') else '浏览器可启动并可继续测试'
  text+=f"| {ident} | {module} | {fmt(label)} | {operation} | {expected} | {actual} | {r['status']} | [{filename}](evidence/{filename}) |\n"
text+='''
### 5.1 已有脚本断言边界及补缺

| 入口 | 实际断言/覆盖 | 边界与补充 |
| --- | --- | --- |
| node --test | 内容路径/原子写入、草稿过滤、真实 Astro 构建、Windows 发布与失败保留、Twikoo 同库/迁移/重启、项目合并与缓存、壁纸 HTTP、外观/光标等 61 例 | build fixture 中部分用例使用简化构建；本次另外通过实际 /api/build 完成真实发布与失败闭环 |
| admin-ui / admin-segments | 实际登录、11 模块导航、分页筛选、五种视图、选项对齐、遮罩/焦点、移动布局、减少动画 | 导航检查不等于各模块完整 CRUD；以 DATA/DYN/COMMENT/MUSIC API+文件+公开 UI 补充 |
| public-ui | 五风格、三模式、主题、对话框焦点、文章轨道、17 条列表/详情路由、移动无溢出、减少动画 | API 被模拟 503，不证明真实后端；本次 routes 与闭环使用真实本机 API |
| ui-polish / liquid-glass / reading-ui | 光标层级、字体/玻璃真实样式与像素对比、目录锚点、渐进模糊、对比度、导航滤镜回退、触屏 | 前两次空内容定位失败不算产品失败；有文章 fixture 后复跑通过 |
| alignment-ui | 后台实际保存页面配置、刷新保留、移动与减少动画 | 未由该脚本证明所有静态发布结果；本次 profile + 发布首页断言补充 |
| managed-player | 模拟歌单与生成 WAV，真实 HTMLAudio 时间推进；空歌单隐藏 | 不证明上传链路或远端源；本次 MUSIC-01 上传真实 WAV 并验证持久文件、206 Range 与播放器 |
| twikoo-ui | 官方 SDK 实际提交、后台读取/回复/隐藏/公开/删除、官方配置管理、移动布局、鉴权 | 独立官方本地数据库，非协议 mock；远端服务/验证码/邮件未验证 |
| project-ui | 模拟完整目录、零星标、详情入口、跨页缓存、过期刷新、断网保留、纯静态回退 | 不证明 GitHub 真正可访问；本次项目 API 落盘和构建详情另验 |

### 5.2 不适用与未执行项

| 范围 | 状态 | 依据/本次边界 |
| --- | --- | --- |
| 多角色授权、用户注册、不同管理员权限隔离 | 不适用 | 源码只有唯一 ADMIN_USER 身份，无 RBAC 用户系统 |
| 单独文章列表 /posts/ 首页、分类/标签总目录、随笔详情页 | 不适用 | 列表实际为 /archive/；分类标签为参数页；随笔聚合在 /notes/ |
| 前台页码分页 | 不适用 | 当前归档整页分组、首页横轨，不存在分页 API；后台列表分页已实测 |
| 草稿专门“撤回”接口/定时文章发布 | 不适用 | 通过编辑 draft 实现撤回；公告有效期是另一个已有功能 |
| 自然等待 30 分钟会话失效 | 未执行 | 已测 logout、无效 Cookie、重启恢复/令牌、CSRF、失败限流；未将这些等同自然过期测试 |
| 每个表单的全部最大长度/Unicode 组合、超 30MB 音频与超 16MB Twikoo | 未执行 | 测过长正文、中文、& 和尖括号、10MB 图片边界；没有覆盖所有字段笛卡尔组合 |
| 并发不同字段编辑同一条目的乐观锁语义 | 未执行 | 已测 8 个并发独立文章、8 个公告、重复 ID/创建及已有原子计数测试；未证明多进程协作或并发编辑合并 |
| 回收站永久删除/全部清空完整浏览器链路 | 未执行 | 新增、删除、回收站落盘及恢复实测；永久清除 UI 未完整验收 |
| 每个独立模块的新增/编辑/删除均经鼠标逐项操作 | 未执行 | 完整 UI 用于已有浏览器脚本；部分管理变更走认证 API 并验证文件/公开 UI，不能称逐表单全覆盖 |
| 缺失图片的所有组件专属占位图/无效链接交互文案 | 未执行 | 已验证不存在资源 HTTP 404、页面可继续用；未逐个组件检验所有回退图片与提示 |
| 损坏业务 JSON 的全站浏览器恢复 | 未执行 | 原子写入/失败回滚测试已跑；没有对每种 JSON 逐个损坏后验证 UI |
| SEO 搜索引擎收录/生产性能基线 | 未执行 | 本地 RSS/sitemap/search 验证不代表搜索引擎抓取；未做 Lighthouse、真实用户性能或负载压测 |

## 6. 前后台数据一致性专项结果

| 闭环 | 写入位置 | 生效时机 | 前台/衍生结果 | 重启结果与缓存 | 结果/证据 |
| --- | --- | --- | --- | --- | --- |
| 新公开文章 + 草稿 + 随笔 | src/content 对应 Markdown；API 200 | 保存不改变旧 dist；构建后公开 | 桌面与手机详情、归档、分类标签正常；索引仅 1 条公开文章 | 正常服务重启后正文/标题一致 | 通过，DATA-01、PUB-01、DATA-04 |
| 草稿泄露检查 | draft=true 源文件仍存在 | 发布过滤 | 首页/归档/搜索/RSS/sitemap 不含两个 DRAFT sentinel；草稿详情不生成 | 已有真实构建单测也验证草稿随笔不泄露 | 通过，PUB-01、verify.log |
| 修改标题/正文/分类/标签/封面 | 同一文件，originalId 保持 | 重建发布 | V1 先保留；V2 后正文更新，搜索旧标题/旧分类/旧标签移除，媒体引用出现 | 重启后同一文件与页面均为 V2 | 通过，DATA-03/04、data-v1、data-v2 |
| 撤回文章 | draft 改为 true | 重建发布 | 文章文件仍在源目录；公开详情消失，索引/RSS/sitemap 移除，公开文章量 0 | 不依赖浏览器缓存得出结论 | 通过，DATA-05 |
| 删除/回收站恢复 | 内容文件移至 data/trash，再恢复原路径 | 恢复后重新发布 | 源文件和回收站列表核对；恢复标题进入搜索 | 后续真实构建继续成功 | 通过，DATA-06 |
| profile/导航/公告/友链/项目 | 对应 data JSON | 动态模块即时；profile HTML/项目详情需发布 | API 与文件一致；真实页面出现标题、导航项、友链、项目详情；过期公告不公开 | profile/友链/评论跨服务重启保留 | 通过，DYN-01/02/03、normal 路由、DATA-04 |
| 评论提交/审核/回复/删除 | 新 Loki 库 | 即时 | 公共计数 1→0→2→0；公开线程回复与后台一致 | 两次重启未复活删除记录 | 通过，COMMENT-01/02、twikoo-ui |
| 音频上传/下架/删除 | music.json + music-files | 即时 | WAV 可 Range 206、播放推进；下架清空公开列表，删除移除文件 | 不将播放器 mock 当真实上传证据 | 正常音频通过；异常文件失败，MUSIC-01/02/03 |
| 清空所有正常内容 | posts/notes 文件全部移入回收站 | 构建检测源路径删除 | search=[]，RSS/sitemap/页面无旧正文与 URL，旧文章目录不存在 | cacheRebuilt=true；服务重启后列表仍空；浏览器归档无旧标题 | 通过，DATA-07、data-cleared、build-cleared.log |
| 并发及重复提交 | Markdown/公告 JSON/评论数据库 | 每次响应后持久化 | 8 次独立文章不丢；重复创建仅 1 次成功；8 次公告均在，重复 ID 仍 1 条 | 同文件原子计数与 Twikoo 并发持久化由本次单测证明 | 通过，CONC-01、DYN-04、verify.log |
| 发布失败 | 故意无效 Markdown 仅在副本 | 构建返回 500 | current 指向不变，已发布 search 仍能读，失败文件随后删除 | 构建锁释放及 Windows 文件占用/切换恢复单测通过 | 通过，PUB-02、build-expected-failure.log |
| 回滚 | current 切到旧 release，源与动态库保留 | 即时切换 | 一方向源计数 1 / 发布索引 0；另一方向源计数 0 / 发布索引 1 | 已对 HTTP 公开索引、统计及浏览器归档截图交叉核实 | 失败，PUB-03、ROLLBACK-02、rollback-comparison.json |

`evidence/data-v1`、`data-v2`、`data-cleared` 保存脱敏后的真实构建派生文件，含索引、RSS、sitemap 和归档 HTML；不是仅凭成功 toast 判定。截图 `normal-*`、`empty-*` 对应独立服务；`existing-ui` 仅收集本次执行后新写入的 40 个截图/产物，没有把仓库旧图算作本次证据。

浏览器观察：独立闭环没有 pageerror；捕获到的 2 次 HTTP 404 均为故意访问 /does-not-exist/。第三方 cravatar 与 owo 配置请求被测试策略阻断，产生 requestfailed/console error，保留在 flows-results.json；它们不是本地脚本崩溃。原有 public-ui 的最终日志另报告 11 个资源/第三方错误，不保证生产零失败请求。异常用例为 API 503 和 timedout 注入，主内容仍可用、无脚本异常；仅证明这两个模拟故障下的可见性和脚本稳定性，不证明所有降级提示的易用性。

性能仅记录主要页面导航完成时间（含 networkidle 等待和 250ms 观察）与测试耗时，未观察到阻碍这些用例执行的持续卡死；不把这当作 Core Web Vitals 或生产性能合格证明。示例含较长中文正文，390×844 与 1440×900 均无页面横向溢出。

## 7. 问题清单

### R-01：随笔缺少日期仍保存成功，随后阻断整站构建

- 严重程度：**高**。类型：产品缺陷。影响：缺少必填日期的随笔进入内容目录后，正常文章也无法通过下一次整站构建发布；旧站点仍保持，不等同线上站点立即宕机。
- 复现：隔离后台登录并携带 CSRF；POST /api/save/notes，body 为 `{"id":"missing-date","fields":{"title":"缺少日期的虚构随笔"},"body":"虚构正文"}`；确认 HTTP 200 与文件落盘；POST /api/build。
- 预期：保存阶段明确拒绝无日期随笔，返回 400 与可操作提示，保持原内容不变。
- 实际：保存 200；构建 500，Astro `InvalidContentEntryDataError` 指向 `notes → missing-date` 的 date schema。失败数据已在副本删除。
- 证据：[NOTE-01](evidence/extra-results.json)、[构建日志](evidence/build-missing-note-date.log)。保存响应与构建响应在 api 数组中。
- 源码：`admin/lib/content.mjs:216` validateEntry 只在 date 存在时校验；`src/content.config.ts:41` 明确要求 `z.coerce.date()`；`admin/server.mjs:454` 保存入口。
- 原因：后台写入契约与前台构建 schema 不一致。此结论同时有源码依据与实际构建复现。
- 建议：统一 notes 必填日期契约，在持久化前校验缺失值、空值和真实日历日期；前端必填提示作为补充，服务端仍需独立拒绝。复测正常/无/空/非法日期、旧数据兼容和失败后正常发布恢复。

### R-02：回滚静态版本后，公开文章量与可访问内容不一致

- 严重程度：**中**。类型：产品缺陷。影响：主页网站数据等消费者拿到的文章量与归档/搜索的已发布版本不同，回滚尤其明显。
- 复现：发布含 1 篇文章的版本 → 撤回并发布 0 篇版本 → 恢复源文章并发布 → 回滚到 0 篇版本；GET /search.json 与 /api/public/site-stats。反方向复现：清空源内容并发布 → 回滚到含文章版本。
- 预期：对访客公布的“文章量”应对应当前可访问静态快照；后台可另外显示源内容量。
- 实际：PUB-03 为 runtime posts=1 / search.length=0；ROLLBACK-02 为 runtime posts=0 / search.length=1，源 Markdown=0。浏览器归档仍展示 1 篇。
- 证据：[比较快照](evidence/rollback-comparison.json)、[浏览器截图](evidence/rollback-count-mismatch.png)、[双向复现](evidence/flows-results.json)、[HTTP 响应](evidence/focused-results.json)。
- 源码：`admin/lib/routes.mjs:24` siteStats/第 28 行直接统计源文件；`admin/lib/build.mjs:379` rollback 只切换 current；`src/pages/archive.astro` 使用构建快照。
- 原因：统计查询源内容，公开页面查询发布快照，两个版本边界没有统一。原有“回滚不改动态数据”单测通过，不能证明访客计数一致。
- 建议：每个 release 生成公开内容计数/manifest，site-stats 按 current 读取该快照；评论/访问量继续实时，不为修计数倒退动态数据库。复测保存未发布、草稿、删改、发布失败、双方向回滚和重启。

### R-03：音乐上传接受任意扩展名及伪造音频

- 严重程度：**中**。类型：产品缺陷。影响：管理员可以得到成功提示并产生无法播放的歌单记录及无效文件；本次未证明可执行代码运行，不将其夸大为远程代码执行。
- 复现：登录+CSRF，POST /api/manage/music/upload?filename=invalid.exe，Content-Type application/octet-stream，内容任意；另提交 filename=broken.mp3、正文为纯文本。
- 预期：服务端拒绝不支持的扩展名与明显不匹配的音频内容，并不新增文件/记录。
- 实际：均返回 200 并写入 music.json/music-files；浏览器 Audio 读取伪 MP3 返回 error code 4，`DEMUXER_ERROR_COULD_NOT_OPEN`。合法 WAV 对照组播放正常。
- 证据：[MUSIC-01/02/03 与响应](evidence/extra-results.json)、[真实音频播放截图](evidence/real-music-playing.png)。MUSIC-02 在更新/排序/下架/删除的断言通过后，于 invalid.exe 断言失败，不能把整个功能均描述为失败。
- 源码：`admin/lib/routes.mjs:266` 音频上传路由；`admin/lib/music.mjs:96` addLocalTrack 仅检查非空 Buffer，计算扩展名后未检查允许类型或音频头。
- 建议：服务端建立支持格式白名单、基本格式头验证及统一大小错误；拒绝结果确保不落盘。复测合法 WAV/MP3、伪装扩展、空/超限、去重、下架删除和播放失败提示。

### R-04：非法内容路径返回 500

- 严重程度：**低**。类型：产品缺陷。影响：非法客户端参数误报服务器故障，UI 难以给出准确反馈；本次没有路径穿越成功或环境内容泄露。
- 复现：登录后 GET `/api/entry/posts?path=..%2F..%2F.env`。
- 预期：400 与明确的非法路径错误，不读取目标文件。
- 实际：500，JSON `{"error":"服务器内部错误"}`。API-01 在该断言中断，后续公开 Twikoo 管理事件及非法状态已通过 API-03 独立补测。
- 证据：[API-02 原始响应](evidence/focused-results.json)、[服务器错误日志](evidence/focused-server.log)。
- 源码：`admin/lib/content.mjs` resolveFile 拒绝路径；`admin/server.mjs:447` 未将参数错误转换为 4xx；第 707 行统一转为 500。
- 建议：对业务输入异常归类为 400/404，对真正内部故障保留 500；保留不暴露内部栈的响应策略。

### T-01：部分 UI 脚本依赖非空博客，却不自建 fixture

- 严重程度：**中**。类型：测试脚本缺陷。影响：当前已清空的合法工作区无法一次运行完整回归，并在入口级中断后失去后续覆盖。
- 复现：在空博客副本执行 public-ui、ui-polish、reading-ui、project-ui。
- 预期：空状态应有专门断言；非空功能应自行建立隔离 fixture 或明确跳过前置条件，不能默认为真实站点有文章/项目。
- 实际：public-ui 等待 rail-track 超时；reading-ui 等待文章卡片超时；ui-polish 2 组不存在卡片/文章失败；project-ui 离线回退断言非空失败。注入固定样例后相关功能通过。
- 证据：首次 `test-*.log`、`seeded-*.log`、[生成脚本](evidence/run-seeded.py)。
- 源码：`scripts/check-public-ui.mjs:181`、`scripts/check-reading-ui.mjs:26`、`scripts/check-ui-polish.mjs:327`、`scripts/check-project-catalog.mjs:56`。
- 建议：公共 fixture 工具在临时副本创建空/正常数据两套数据集；断言分别命名，避免用真实内容充当前置条件。

### T-02：公开 UI 脚本存在一次导航/脚本执行竞态

- 严重程度：**低**。类型：测试脚本稳定性问题，尚不能由本次证据确认浏览器产品导航缺陷。
- 复现：已有样例副本运行原 `npm run test:public-ui`；首次在 document.fonts.ready 处报 execution context destroyed。
- 预期：等待页面导航与 Astro 生命周期稳定后再 evaluate。
- 实际：一次中断；不改产品或原脚本直接重试，11 个逻辑组通过。没有足够重复次数估算发生率。
- 证据：[竞态失败](evidence/seeded-test-public-ui.log)、[原样复跑](evidence/seeded-test-public-ui-retry.log)。源码 `scripts/check-public-ui.mjs:101`。
- 建议：捕捉实际二次导航/生命周期来源，增加就绪哨兵与导航等待；保留失败截图、URL 与 navigation trace，避免仅用通用重试掩盖问题。

## 8. 未完成项与验证限制

| 依赖/场景 | 状态 | 实际做了什么 | 继续验证所需条件 |
| --- | --- | --- | --- |
| GitHub 实网同步/限流 | 未执行（真实联网）；通过（模拟契约） | 本次单测执行分页、非法响应、失败缓存和帐号切换；项目 UI 以模拟响应验证 TTL 与降级；配置 githubUser 为空 | 专用公开测试账号/确定仓库集与网络；不使用真实私人项目数据 |
| 外部网易云/Meting 多级源 | 未执行（实网） | 默认歌单空；模拟 WAV 和真实本地 WAV 均播放；没有宣称远程歌曲可播 | 可公开播放的测试曲目、可用解析源、预期地区/版权条件 |
| 外部 Twikoo/MongoDB | 未执行 | 使用全新官方本地 Loki；测试了真实 SDK 与官方服务，不是云端数据库 | 专用可销毁服务与数据库、独立通知配置 |
| cravatar/owo 等第三方资源 | 阻塞于测试网络策略（实网未验） | 捕获且保留失败请求，页面主要功能仍可用 | 单独允许指定域的只读联网验证 |
| 远程备份/完整恢复 | 未执行 | 全部构建禁用备份，日志有跳过证据；回收站恢复和失败保留不冒充全库恢复 | 独立临时私人仓库与明确恢复目标；仍不可触碰真实备份 |
| Firefox/WebKit | 阻塞 | 两次 launch 均实际尝试，文件不存在；未安装/下载更改环境 | 预装对应 Playwright 浏览器后执行同等业务用例 |
| nginx/HTTPS/secure cookie/生产服务管理 | 未执行 | 本地同源代理模拟静态 current + API 反代；Windows junction 真实运行 | 单独 staging 配置、测试域名和证书 |
| 30 分钟空闲、跨天统计、时钟漂移 | 未执行完整时间场景 | 固定样例日期 2026-10-20，浏览器指定上海时区；单测含日期/日统计逻辑 | 可控时钟或完整等待窗口，以及独立统计基线 |
| 高负载/真实慢网/CPU 性能 | 未执行 | 并发仅 8 条业务写入、小量重复提交，无高负载压测 | 单独性能目标与可销毁测试资源 |

测试器自身修正记录：最初 NODE_OPTIONS --import 使用 Windows 路径导致 Node 不识别 URL，改为 pathToFileURL；服务重启后记住登录令牌自动恢复会话，测试器需读取新 CSRF，不能再次假设必有登录表单；主题按钮使用异步交互，需要等待属性更新；整页 HTML 中的百分比不能整串 decodeURIComponent，只对 sitemap 解码。原始失败保存在 flows-initial-harness-error、flows-first-run、flows-second-run；这些运行器失误未计产品缺陷。最后一次完整 flows 仅剩 R-02 及两个浏览器环境阻塞。

## 9. 修复优先级与复测建议

1. **R-01**：先统一后台保存校验和 Astro schema。复测 NOTE-01、正常随笔发布、空日期/非法日期/编辑删除日期，以及失败后恢复发布。
2. **R-02**：定义“已发布文章量”的版本来源，随 current 切换。复测 PUB-03、ROLLBACK-02、保存未发布/撤回/删除/清空、发布失败和重启。
3. **R-03**：补齐音频服务端类型/格式检查与准确错误反馈。复测 MUSIC-01/02/03、空文件/超限/重复、Range、上架下架和删除。
4. **R-04**：统一输入异常的 HTTP 状态。复测 API-02/03 以及未知集合、无效 ID、目录穿越、未登录、缺 CSRF，确保 4xx/5xx 含义一致。
5. **T-01/T-02**：把 UI 数据前提内置到隔离夹具，记录生命周期就绪。要求空博客一次执行成功，正常样例连续执行仍稳定；再安装额外浏览器扩展覆盖。

不建议用“verify 全绿”替代上述复测：它没有执行全部 UI 入口，也没有对缺日期随笔、上传伪音频和发布版本统计做完整闭环断言。本次未修产品，报告中的失败状态仍有效。

## 10. 收尾确认

- 新增文件全部位于本报告目录：报告、证据 JSON/日志、当前会话生成的截图、脱敏 fixture 和必要测试/复现脚本；未新增业务功能、改依赖或提交 Git。
- [protection-check.json](evidence/protection-check.json) 确认 20 个真实业务文件及文件集合前后完全相同，actual Markdown=0，原有 5 项 Git 改动逐项保留；唯一新增 Git 路径为 docs/testing/。
- [cleanup.json](evidence/cleanup.json) 确认两个本次临时副本删除；先断开 node_modules/current junction，再删除其余实体文件，没有沿链接删除原工作区。
- [ports-after.json](evidence/ports-after.json) 为本次使用端口的最终监听复核；全部为空。每个运行器 finally 关闭浏览器与服务，未停止用户原有进程。
- `existing-ui` 内 40 个文件由本次 mtime 过滤收集；原工作区历史截图没有被覆盖。临时音乐、评论、统计与源内容随临时副本删除，只保留报告必要证据。
- 没有发出评论通知、邮件或用户消息；没有接入真实评论库；没有远程备份、部署、提交或推送。

### 可复现说明

以下命令均在 Windows PowerShell、项目根目录执行；需要仍与 baseline 相同的源码/未提交配置及已安装依赖。不得直接在原工作区运行产品写入测试。测试脚本只需读取原依赖，但会创建新的临时实体副本。

```powershell
$evidence = 'E:\\Project\\L1angK1NG_Website\\docs\\testing\\2026-10-20_212951\\evidence'
$env:PYTHONIOENCODING = 'utf-8'
python (Join-Path $evidence 'prepare-audit.py')
python (Join-Path $evidence 'run-entries.py')
# 空博客源码需要在 flows 副本先有一次静态构建；本次基线自带 dist。
# 原版固定样例生成后复跑失败的四个入口：
python (Join-Path $evidence 'run-seeded.py')
# 4520/4521/4540 必须空闲；以下两个脚本顺序执行，不能共用副本并行。
node (Join-Path $evidence 'flows.mjs')
node (Join-Path $evidence 'extra.mjs')
node (Join-Path $evidence 'focused.mjs')
```

prepare-audit 会把位置写入系统临时目录 blog-audit-location.json，并把输出指向新的 docs/testing/repro-时间戳/evidence，避免覆盖本次证据。副本若没有 dist，先仅在 flows 副本设置 BACKUP_ENABLED=false、SITE_URL=http://127.0.0.1:4521 后执行 npm run build，再运行 flows。首次公开 UI 的字体等待竞态可能需要保留原日志并重试，不能静默覆盖。cleanup-audit.py 是本次指定临时路径的收尾记录脚本，含严格原路径断言；复现后应核实新的两个临时绝对路径、先移除 junction，再清理，不能盲目照用旧路径。

测试数据没有随机内容种子：代表性正文、12 篇样例、4 章节、日期、标题和断言 sentinel 都由脚本固定生成；账号凭据、记录 ID 和 release 时间戳有意每次不同，不参与业务期望。真实音频由固定 8kHz/220Hz 正弦 WAV 生成。公告过期条件使用 endAt=1（固定早于本次时间），避免测试时刻边缘波动。测试预期失败用例会在 JSON 中标失败，即使脚本自身完成并返回 0，也不能当成测试全通过；应以逐例结果审阅。
'''
# 本文件为首次生成过程的证据；最终报告另含收尾隔离审查补充，不应覆盖。
(folder/'测试报告-重新生成草稿.md').write_text(text,encoding='utf8')
print('报告已生成',len(text),'字符；矩阵',len(allrows),'行')
