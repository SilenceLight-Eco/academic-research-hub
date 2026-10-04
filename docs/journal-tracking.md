# 文献追踪部署说明

文献追踪由三个部分组成：浏览器界面、Supabase 数据表，以及每天运行一次的 `journal-tracker` Edge Function。

## 数据来源与字段含义

- 期刊官网 RSS / Atom：首选文章发现来源。添加订阅时或之后，可粘贴该期刊官网提供的公开 HTTPS feed 地址；支持 RSS 2.0 与 Atom。
- Semantic Scholar：按 DOI 批量补充作者与摘要；未提供摘要时保留为空，不生成或猜测摘要。
- Crossref：期刊检索、RSS 缺失或读取失败时的文章发现后备，以及 DOI、标题、作者、日期、链接、主题词等元数据后备。
- 关键词仅采用期刊原文页面明确声明的作者关键词；未提供时保留为空。RSS 分类、Crossref 主题词和 Semantic Scholar 学科分类不会冒充作者关键词。

## Zotero 导入与阅读状态

文献追踪中的“导入Zotero”在桌面端确认收到条目后，自动将原先未读的文章标为已读并保存到云端，更新未读数量并折叠已读分组。取消分类选择、桌面连接失败或导入失败不会改变阅读状态。已读文章“重新导入”不会刷新阅读时间或延长三天保留期。

如果条目已经导入、但云端阅读状态保存失败，会单独提示“已导入 Zotero，但自动标记已读失败”；导入记录仍保留，此时可手动点击“标为已读”，无需重复导入。桌面端已收到条目但分类移动失败时，同样标为已读，并提示手动归类。

## 期刊更新诊断

“我的期刊”中每本期刊显示最近检查时间、最近成功时间、本次实际发现来源（官网 RSS、官网 Atom 或 Crossref）以及处理篇数。处理篇数包括已经收录但重新补齐信息的文章，不代表新增数。

更新结果分为更新成功、后备更新成功、更新失败和等待首次检查。官网 feed 失败但 Crossref 检查成功时标为后备更新成功，展开原因可查看官网读取问题。有效但为空的 feed 视为检查成功、处理 0 篇，不会误报失败。失败与后备状态提供“立即重试”，其他状态提供“重新检查”，只检查该期刊；原因不会遮挡原有文章。

诊断结果保存在订阅的 `last_sync_details` 及更新日志的 `details`，刷新页面后仍可查看。旧记录没有实际来源时显示“尚未记录”，下一次检查后补齐。数据库需执行 `supabase/migrations/202609300001_journal_sync_diagnostics.sql` 后再部署新版函数。

## 部署步骤

### 已读清理与防重复

执行 `supabase/migrations/202610020001_journal_read_dedup_history.sql` 后，已读文章仍按阅读时间保留三天再清理，但数据库私有表会保留轻量的 DOI / 标题指纹与阅读时间。已清理文章再次出现在 RSS 或 Crossref 中时，不会重新收录为未读。规范化 DOI，以及忽略大小写、空格、标点的完整长标题用于识别同一期刊内的同一文章；发表日期变化不会创建新副本。

去重触发器适用于定时更新、手动更新和数据库的已读操作；不需要重新部署 Edge Function。已有且未清理的已读文章会回填历史，过去已删除的阅读记录无法凭空恢复。手动改为未读仍有效，取消期刊订阅或删除账号时会同步清理相应的去重记录。去重记录不包含摘要、关键词或全文，也不会暴露给其他用户。

回归验证：`node scripts/test-journal-read-dedup.cjs <@electric-sql/pglite 模块路径>`，在隔离 PostgreSQL 中执行实际迁移，覆盖三天清理后再发现、DOI/日期/标点变化、已读状态保持与未读操作。

后续执行 `supabase/migrations/202610040001_journal_identity_aliases.sql`，修复尚未阅读时发现的新 DOI / 标题被丢弃的问题：跳过重复条目时仍记住它的新标识；阅读、三天清理后继续保留这些标识，已清理文章出现新标题时也扩展历史。只有真正从已读改为未读才清除相应阅读历史，普通元数据更新不会清除。迁移不删除文章、不替用户标记已读，也无法恢复升级前已丢失的标识。补充验证：`node scripts/test-journal-identity-aliases.cjs <@electric-sql/pglite 模块路径>`。

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

函数也支持用户在网页中点击“立即检查更新”。输入 ISSN 或能唯一匹配的期刊全名可直接订阅；每次添加后立即抓取近期文章。中文期刊会同时搜索 Crossref 期刊目录及论文记录；仍未匹配时可按中文刊名建立订阅，后续按刊名查询 Crossref 文章。若 Crossref 没有该刊记录，可填写期刊官网公开 RSS / Atom 地址，ISSN 可选。网页打开“文献追踪”模块时，也会自动检查并刷新超过 24 小时未更新的订阅。

注意：网页打开时的自动检查不等于后台定时任务；若要在工作台关闭时仍然每天抓取，必须完成上面的 Secret 与 Supabase Cron 配置。每个账号只能读取和管理自己的期刊订阅与文章记录。

RSS URL 由订阅用户填写，服务端仅接受 HTTPS 公网地址，并限制 feed 响应大小；每个订阅都可单独填写、修改或清空 RSS 地址。清空后会自动回到 Crossref 文章发现后备。
