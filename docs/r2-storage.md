# R2 私有附件配置

R2 接入用于论文复现的论文 PDF、附件、数据、代码、复现结果文档，以及其他模块共用的云端附件。现有 Supabase 文件无需迁移，仍按原位置下载和删除。新上传在 R2 配置完成后使用 R2；配置未完成时继续使用原存储的50 MB上限。

## 1. 启用 R2 与创建存储桶

1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)，选择自己的账号。
2. 进入 **存储和数据库（Storage & databases）→ R2 对象存储 → 概览（Overview）**。菜单名称可能随控制台语言略有不同。
3. 如果尚未启用，按页面完成 R2 启用。付款方式和服务条款须由账号持有人确认。
4. 创建名为 `academic-research-hub` 的存储桶，存储类别选 **Standard**。保持私有，关闭公开开发 URL 和公开自定义域名。
5. 在该存储桶 **Settings → CORS Policy** 中保存以下 JSON：

```json
[
  {
    "AllowedOrigins": ["https://silencelight-eco.github.io"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Content-Length"],
    "MaxAgeSeconds": 3600
  }
]
```

自己部署到其他域名时，将该域名加入 CORS，并修改 `supabase/functions/r2-attachments/core.mjs` 的允许来源。CORS 中填写源站，不含 `/academic-research-hub/` 路径。后端使用 S3 API 做完成、终止及删除操作，无需把 DELETE 开放给浏览器。

在存储桶生命周期规则中保留或启用“终止未完成的分片上传”（建议7天）。它只清理未完成的分片，不删除已上传文件。关闭网页会中断当前上传；网络短暂故障会重试当前分片，最终确认响应丢失可在重新打开附件列表时恢复。

## 2. 创建凭据并保存在 Supabase

在 R2 概览的 **Manage R2 API Tokens** 中创建 R2 凭据，权限选择 **Object Read & Write**，范围仅限 `academic-research-hub` 存储桶。勿使用账号全局 API Key。保存生成的 **Access Key ID** 和 **Secret Access Key**，后者通常只显示一次。

打开 [项目 Secrets](https://supabase.com/dashboard/project/gqopwqpysoixcgdacurx/functions/secrets)，添加：

| Secret 名称 | 填写内容 |
| --- | --- |
| `R2_ACCOUNT_ID` | Cloudflare Account ID，见 R2 的 S3 API 端点 |
| `R2_BUCKET_NAME` | `academic-research-hub` |
| `R2_ACCESS_KEY_ID` | R2 Access Key ID |
| `R2_SECRET_ACCESS_KEY` | R2 Secret Access Key |

无需将密钥发送到聊天、写入公开仓库或浏览器配置。Supabase 自带的 `SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY` 无需重复创建。应用登录账号不需要知道 R2 密钥。

## 3. 应用数据库变更与部署

先在 [Supabase SQL Editor](https://supabase.com/dashboard/project/gqopwqpysoixcgdacurx/sql/new) 新建查询，执行仓库文件 `supabase/migrations/202611130001_r2_attachments.sql` 的全部内容。它为原附件增加存储类型，保留原记录和账号隔离，并建立服务端上传会话表。

在项目目录运行：

```powershell
npx supabase login
npx supabase functions deploy r2-attachments --project-ref gqopwqpysoixcgdacurx
```

如已启用每日快照，可在完成数据库变更后更新该函数，使快照包含附件存储类型：

```powershell
npx supabase functions deploy automatic-backup --project-ref gqopwqpysoixcgdacurx
```

CLI 的登录账号需要该 Supabase 项目的 Developer 或更高权限。`Invalid access token` 需要重新登录；`403` 需要检查登录账号的项目权限。不要反复运行数据库连接命令：该 SQL 可直接在控制台执行。

后端配置全部完成后，将 `web/r2-attachments.js` 中 `window.__academicR2UploadsEnabled = false` 改为 `true`，更新前端资源版本并发布网页。该开关不包含密钥，用于防止后端尚未部署时影响原附件功能。

## 4. 验证

1. 登录工作台，在论文复现中选择任务，先上传一个小文件，再上传一个超过50 MB的测试文件。
2. 确认进度到100%后列表出现文件，刷新仍能看到；下载后核对大小和内容。
3. 使用另一个账号确认看不到该文件；旧 Supabase 附件仍能正常下载。
4. 若浏览器提示无法连接 R2，首先检查存储桶的 CORS 域名、GET／PUT 方法，以及后端四个 Secrets。

文件通过短期签名 URL 分片直传 R2，Edge Function 验证登录身份、文件归属、分片长度和最终对象大小后才写入文件列表。下载使用短期私有链接，大文件不会先整个读入浏览器内存。

## 大小、备份与费用

本接入支持单文件最多 **5 TB（十进制）**，并受 R2 自身分片和存储限制约束。上传速度仍由网络决定。它不等于无限免费存储；R2 Standard 提供免费额度，超出部分按 Cloudflare 当前价目计费，启用前请查看账号账单设置。

工作台 JSON 备份和每日快照保存工作台内容及附件目录，不复制 R2 文件。完整 ZIP 备份可包含总量不超过500 MB的附件，超过时会在下载前提示分别下载文件，避免浏览器打包大数据集时耗尽内存。500 MB以内的旧完整 ZIP 可按原流程恢复，恢复附件时使用当时已配置的存储。

官方文档：[R2 入门](https://developers.cloudflare.com/r2/get-started/)、[预签名 URL](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)、[CORS](https://developers.cloudflare.com/r2/buckets/cors/)、[限制](https://developers.cloudflare.com/r2/platform/limits/)、[定价](https://developers.cloudflare.com/r2/pricing/)。
