# 本地发布、验证与数据一致性实施清单

**目标：** 修复搬迁后的 Windows 发布环境，建立关键回归检查，同步文档并修复已确认的数据一致性问题。

**方案：** 沿用静态前台、单进程 Express 与文件存储。直接修复现有发布模块，使用 Node 内置测试运行器和隔离目录测试真实文件操作；不引入数据库或新的 UI 框架。

**技术：** Node >=22.12.0、Astro 7、node:test、astro check、ESLint。

## 1. 本地发布

- [x] 在 `tests/build.test.mjs` 中复现失效 junction 导致发布失败，验证构建失败保留原发布、切换失败恢复原链接、回滚与构建互斥。
- [x] 在 `admin/lib/build.mjs` 用 lstat 判断链接本身是否存在，限制临时链接清理范围，补齐失败清理和回滚锁。
- [x] 运行 `node --test tests/build.test.mjs`，确认失败用例修复后通过。
- [x] 全部代码验证完成后，以 `BACKUP_ENABLED=false` 执行本地 `npm run deploy`，验证 current 指向当前工作目录的有效发布。远端备份不属于本轮发布验证范围。

## 2. 关键验证与文档

- [x] 创建 `tests/helpers/fixture.mjs`，将依赖模块复制到项目内随机隔离目录，所有内容写入和构建都只发生在该目录；清理前校验边界。
- [x] 在 `tests/content.test.mjs` 验证中文路径、未知 frontmatter 保留、重命名冲突、回收站恢复。
- [x] 在 `tests/store.test.mjs` 验证并发更新不丢计数，失败的更新不污染数据，也不阻塞后续写入。
- [x] 添加 `check` / `test` / `verify` npm 命令和类型检查依赖，在 Windows 与 Linux CI 中执行。
- [x] 扩展 `scripts/check-dist.mjs` 检查搜索 URL 对应产物；在真实 Astro 隔离构建中验证草稿不进入文章、归档、搜索、RSS、分类、标签与 sitemap，并验证中文 URL、图注与删除后重新发布。
- [x] 对类型检查暴露的真实类型问题逐处修正，保留严格模式。
- [x] 同步 README、DEPLOY、API 和环境变量示例：运行环境、搜索范围、内置评论、会话时效、实时/构建数据边界、回滚边界、备份默认值和测试命令。

## 3. 数据一致性

- [x] 在 `tests/site-stats.test.mjs` 直接验证 TypeScript 快照函数对数字桶、新 pv 桶、过渡 count 桶、缺失数据和北京时间日界线的处理。
- [x] 修复 `src/lib/site-content.ts` 的今日访问量读取，保持旧格式兼容。
- [x] 在内容与 JSON 存储测试中注入写入提交失败，验证旧文件完整、重命名失败保留源文件、临时文件被清理。
- [x] 创建 `admin/lib/atomic-file.mjs` 统一同步/异步原子写入，使用同目录唯一临时文件，接入 `content.mjs` 与 `store.mjs`。
- [x] 运行 `npm run verify`；检查差异和 Git 状态；记录验证结果。

## 验收

本地发布可访问；错误场景保留有效旧数据/版本；测试、类型检查、lint、构建、产物检查全部通过；测试不读写真实文章或运行数据；文档与当前行为一致。

## 本地验收记录（2026-10-11）

- Windows / Node 24.19.0：`npm run verify` 成功，20 项测试通过，严格类型检查 0 errors / 0 warnings（27 条 hints），真实构建与产物体检通过。
- 临时关闭备份后执行 `npm run deploy` 成功；current 指向本项目 `releases/2026-10-11T14-17-15-020Z`，原环境变量已还原。
- 启动实际后台进行 HTTP 检查：首页、文章、登录页、未登录 401、无 CSRF 403、公开统计与统一网关、未知地址 404 均通过，检查进程已停止。
- Windows / Linux CI 已配置，远端尚未运行。此次未推送代码或远端备份。
