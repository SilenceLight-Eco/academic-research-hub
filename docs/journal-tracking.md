# 文献追踪部署说明

文献追踪由三个部分组成：浏览器界面、Supabase 数据表，以及每天运行一次的 `journal-tracker` Edge Function。

## 数据来源与字段含义

- 期刊官网 RSS / Atom：首选文章发现来源。添加订阅时或之后，可粘贴该期刊官网提供的公开 HTTPS feed 地址；支持 RSS 2.0 与 Atom。
- Semantic Scholar：按 DOI 批量补充作者与摘要；未提供摘要时保留为空，不生成或猜测摘要。
- Crossref：期刊检索、RSS 缺失或读取失败时的文章发现后备，以及 DOI、标题、作者、日期、链接、主题词等元数据后备。
- 关键词优先采用 RSS 分类，其次 Crossref 主题词，再次 Semantic Scholar 学科分类。界面会显示来源；学科分类不等同于作者提交的关键词。

## 部署步骤

1. 在 Supabase SQL Editor 执行 `supabase/migrations/202609210002_journal_tracker.sql`。
2. 部署 `supabase/functions/journal-tracker`，并保持 `supabase/config.toml` 中该函数的 `verify_jwt = false`。函数内部仍会验证普通用户的登录令牌；关闭网关 JWT 校验是为了允许 Cron 使用独立密钥调用。
3. 在 Supabase Edge Function Secrets 中添加高强度随机值 `JOURNAL_TRACKER_CRON_SECRET`。
4. 可选添加 `CROSSREF_MAILTO`，用于遵循 Crossref polite pool 建议；如有 Semantic Scholar API key，可配置为 `SEMANTIC_SCHOLAR_API_KEY` 以获得更稳定的 API 额度。无 key 时仍会尝试公开 API。
5. 在 Supabase Cron 创建每日 HTTP 任务：
   - Method：`POST`
   - URL：`https://gqopwqpysoixcgdacurx.supabase.co/functions/v1/journal-tracker`
   - Header：`Content-Type: application/json`
   - Header：`x-cron-secret: <与 Secret 完全相同的值>`
   - Body：`{"action":"cron"}`
   - Schedule：建议每天北京时间 08:00，即 UTC `0 0 * * *`

函数也支持用户在网页中点击“立即检查更新”。输入 ISSN 或能唯一匹配的期刊全名可直接订阅；每次添加后立即抓取近期文章。中文期刊如未被 Crossref 收录，可输入期刊名称和公开官网 RSS / Atom 地址直接添加，ISSN 可选；此类手动订阅只依赖 RSS，不会对合成内部标识调用 Crossref。网页打开“文献追踪”模块时，也会自动检查并刷新超过 24 小时未更新的订阅。

注意：网页打开时的自动检查不等于后台定时任务；若要在工作台关闭时仍然每天抓取，必须完成上面的 Secret 与 Supabase Cron 配置。每个账号只能读取和管理自己的期刊订阅与文章记录。

RSS URL 由订阅用户填写，服务端仅接受 HTTPS 公网地址，并限制 feed 响应大小；每个订阅都可单独填写、修改或清空 RSS 地址。清空后会自动回到 Crossref 文章发现后备。
