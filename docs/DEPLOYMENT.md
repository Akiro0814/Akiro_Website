# 部署、发布与备份

本页面向 Linux 服务器；Windows 本地入门见 [README](../README.md)，配置与日常写作见[配置指南](CONFIGURATION.md)，架构与测试见[开发指南](DEVELOPMENT.md)。



前置：一台 Linux 服务器，已安装 **Node.js ≥ 22.12.0**、**git**、**nginx**。建议先运行 `npm ci` 与 `npm run verify` 再发布。

## 服务器部署

### 1. 拉取项目并配置

```bash
sudo mkdir -p /var/www && cd /var/www
sudo git clone <你的仓库地址> blog
cd blog
npm ci

# 配置环境变量（含后台账号、密钥）
cp .env.example .env
nano .env       # 设置 ADMIN_USER / ADMIN_PASSWORD_HASH / SESSION_SECRET / SITE_URL 等
```

设置/修改管理员密码：

```bash
npm run admin:hash -- "你的新密码"
# 把输出的 ADMIN_PASSWORD_HASH=... 覆盖写入 .env
```

在 `.env` 里把 `COOKIE_SECURE=true`（部署在 HTTPS 后面时），`SITE_URL` 改成正式域名。

### 2. 首次构建发布

```bash
npm run deploy      # 构建前台并原子发布到 current/
```

执行后会生成 `releases/<时间戳>/` 并把 `current` 指向它。

### 3. 配置 nginx

`/etc/nginx/sites-available/blog`：

```nginx
server {
    listen 80;
    server_name your-domain.com;   # 换成你的域名

    # 前台静态站点
    root /var/www/blog/current;
    index index.html;

    location / {
        try_files $uri $uri/ $uri/index.html =404;
    }

    # 后台与接口反代到管理服务
    location /admin {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /admin-assets {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
    }
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 20m;   # 允许上传图片
    }
}
```

> **安全响应头**：后台服务自带基础安全头（`X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy`、`Permissions-Policy`、`HSTS`（`COOKIE_SECURE=true` 时）、CSP report-only），nginx 无需重复配置——即使跳过 nginx 直连 4000 端口也有基本防护。前台静态文件可按需在 nginx 补充缓存与压缩策略。
>
> **会话存储**：会话使用 express-session 的 MemoryStore，滚动有效期为 30 分钟。默认勾选「记住登录状态」时，另发持久化令牌（存 `data/remember-tokens.json`），在有效期内可在服务重启后恢复登录。退出登录会撤销令牌。cookie 为 `HttpOnly + SameSite=Strict`；生产 HTTPS 环境还启用 `Secure`。

启用并配置 HTTPS（推荐 certbot）：

```bash
sudo ln -s /etc/nginx/sites-available/blog /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d your-domain.com   # 自动签发并强制 https
```

### 4. 用 systemd 守护管理服务

`/etc/systemd/system/blog-admin.service`：

```ini
[Unit]
Description=Blog admin backend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/blog
ExecStart=/usr/bin/node admin/server.mjs
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo chown -R www-data:www-data /var/www/blog   # 让服务有写入内容与构建的权限
sudo systemctl daemon-reload
sudo systemctl enable --now blog-admin
sudo systemctl status blog-admin
```

> 若构建/写文件报权限错误，确认运行服务的用户对 `/var/www/blog`（尤其 `src/content/`、`public/uploads/`、`releases/`、`dist/`）有写权限。

---

## 安全建议

- **后台是最高权限入口**（能触发构建），务必：启用 HTTPS、设强密码、只开 80/443 端口。
- 修改默认密码：`npm run admin:hash -- "新密码"`，更新 `.env` 后 `sudo systemctl restart blog-admin`。
- `.env` 已被 `.gitignore` 忽略，不要提交到仓库。
- 登录接口内置了失败限流（连续错误会临时锁定），可抵御简单暴力破解。
- 如需更严格，可在防火墙限制 4000 端口仅本机访问（nginx 反代即可，外部无需直连 4000）。

---

## 构建与发布机制

- 「构建并发布」执行 `astro build`，成功后把 `dist/` 移入 `releases/<时间戳>/`，并把 `current` 软链接原子地指向它。
- nginx 始终服务 `current/`，所以构建过程中线上不受影响；构建失败则 `current` 保持原样。
- 默认保留最近 **5** 个发布版本，旧的自动清理，便于回滚。
- 「回滚上一版」把 `current` 指回上一个版本，与构建共用锁。只回滚静态产物，不恢复 Markdown 源文件、评论、歌单、统计等运行数据；后续重新构建仍使用当前源文件。

也可以用命令行手动发布（例如配合 cron 或 webhook）：

```bash
npm run deploy
```

- 每次「构建发布」成功后，后台会自动把个人数据备份到 GitHub 私有仓库（见「八、数据备份与恢复」）；备份或推送失败不影响发布结果。

---

## 部署排错

**后台保存了，前台没变化？**
保存只写文件，需要到「构建发布」点「构建并发布」才会上线。

**构建失败怎么办？**
线上保持原版本不受影响。看「构建发布」里的构建日志定位问题（通常是 frontmatter 或 Markdown 语法），改好后再构建。

**忘记管理员密码？**
在服务器上 `npm run admin:hash -- "新密码"`，把输出写入 `.env` 的 `ADMIN_PASSWORD_HASH`，重启 `blog-admin` 服务。

**图片传哪里了？**
`public/uploads/`，构建后可通过 `/uploads/文件名` 访问，可直接插入正文或用作封面。

---

## 数据备份与恢复

公开仓库只保存源码；文章、媒体、动态数据等个人数据由 `.gitignore` 保护，基础页面配置仍随源码分发。为了不丢数据，后台在**启用并正确配置备份后，在每次「构建发布」成功后尝试备份**。

### 备份了什么

| 备份内容 | 说明 |
| --- | --- |
| `src/content/` | 文章与随笔（Markdown） |
| `public/uploads/` | 后台上传的媒体 |
| `data/` | 动态数据（评论/友链/歌单/公告/统计/项目/导航/页面文案） |
| `profile.jpg` | 个人头像 |
| `.env` | 默认不备份；显式设置 `BACKUP_INCLUDE_ENV=true` 才包含配置与凭据 |

构建产物（`dist/`、`releases/`）不在备份范围——源码与上表数据可重建站点；另需保存未被自动备份覆盖的自定义资源。

`public/wallpapers/` 和自行替换的 `public/avatars/` 不在现有自动备份清单中，必须另行备份。复制 Loki 数据库前先停止后台，避免复制到半写入状态。

### 备份到哪

- **本地**：不保留。备份在系统临时目录里建临时 git 仓库完成（拉取远端历史衔接 → 复制数据 → 提交 → 推送），推送完整个删除，本地不留任何备份缓存。
- **远端**：GitHub 私有仓库。地址在后台**「构建发布 → 数据备份」**卡片里填写保存（存 `data/backup-config.json`）；留空时依次回落 `.env` 的 `BACKUP_REMOTE_URL`、GitHub 主仓库 origin 推导的 `<owner>/<repo>-backup.git`。无法推导且未配置时跳过备份。改完地址下一次发布生效。

每次发布一个提交，远端历史完整可回溯；已删除的文章/媒体也会同步从备份中移除（纯镜像）。

**首次启用（只需一次）**：在 GitHub 上创建一个**私有空仓库**，名称与远端地址一致（如 `your-blog-backup`）。之后的推送全自动；在此之前推送会失败并记录在构建日志里，建好库后无需任何操作，下一次「构建发布」或 `npm run backup` 会自动重试。

### 手动备份

```bash
npm run backup
```

### 相关配置（.env）

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `BACKUP_ENABLED` | `true` | 设为 `false` 关闭自动备份 |
| `BACKUP_REMOTE_URL` | 从 GitHub origin 推导 | 后台未填写时的回落配置；无配置且无法推导时跳过备份 |
| `BACKUP_INCLUDE_ENV` | `false` | 显式开启后才连 `.env` 一起备份 |

> 推送失败（网络断、仓库未建、凭据过期）不影响发布结果：该次备份作废（临时目录已清理，数据源在项目内不会丢失），下次发布或手动 `npm run backup` 时自动全量重试。具体原因会写进构建日志。

### 恢复步骤

1. `git clone` 公开源码仓库，`npm ci`
2. `git clone` 私有备份仓库，把 `src/content`、`public/uploads`、`data`、`profile.jpg` 拷贝到项目对应位置；默认不含 `.env`，需从安全保存的配置恢复，或基于 `.env.example` 重新配置
3. `npm run deploy` 重新构建发布

### Twikoo 评论服务

官方 Twikoo 随 `npm run admin` 一起运行，默认数据库在 `data/twikoo/`，不需要额外端口或云数据库。前台官方 SDK 由构建自动复制到 `dist/vendor/`，需随整个静态产物发布；前后台 SDK/核心固定为同版本。后台「评论 → Twikoo 完整管理」复用博客登录。

默认 Loki 目录只应由一个后台进程使用；复制或恢复整个数据库前先停后台。可选使用 `MONGODB_URI` 或接入已有 HTTP(S) Twikoo，详见 [Twikoo 配置与恢复](TWIKOO.md)。升级后需重启后台并重新构建前台；旧 JSON 评论会在首次使用时自动迁移，原文件保留。邮件、图床等外部服务按实际凭据配置后才可使用。
