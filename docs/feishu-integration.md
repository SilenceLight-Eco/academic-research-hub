# 飞书文档联动

知识库和公众号笔记支持通过飞书 OAuth 连接用户自己的飞书账号，导出 Markdown 为新飞书文档，或从已有飞书文档导入 Markdown。飞书访问令牌只保存在 Supabase 服务端表中，前端和公开仓库不保存 App Secret 或用户令牌。

## 必要配置

1. 飞书应用已创建，并在“权限管理”的**用户权限**中启用 `docx:document`（创建及编辑新版文档）和 `docx:document.block:convert`（文本内容转换为云文档块）。应用状态必须允许 OAuth 用户授权；添加权限后创建并发布应用版本。
2. 在飞书开放平台“安全设置”中，将下面的地址加入 OAuth 重定向 URL 白名单：

   `https://gqopwqpysoixcgdacurx.supabase.co/functions/v1/feishu-oauth-callback`

3. 在 Supabase 项目 `gqopwqpysoixcgdacurx` 的 Edge Function Secrets 中设置 `FEISHU_APP_ID`、`FEISHU_APP_SECRET`。不要将 App Secret、访问令牌或刷新令牌提交到 GitHub、前端或聊天。
4. 执行 `supabase/migrations/202609210001_feishu_oauth.sql`，创建仅 Edge Function 服务角色可访问的 OAuth state 与用户令牌表。
5. 部署 `feishu-oauth-start`、`feishu-oauth-callback` 和 `feishu-sync` Edge Functions。`feishu-oauth-callback` 必须允许未登录访问（它通过一次性 state 校验回调）；另两个函数要求有效 Supabase 用户 JWT。旧版 `feishu-export` 已停用。

CLI 示例（需先安装并登录 Supabase CLI）：

```powershell
supabase functions deploy feishu-oauth-start --project-ref gqopwqpysoixcgdacurx
supabase functions deploy feishu-oauth-callback --no-verify-jwt --project-ref gqopwqpysoixcgdacurx
supabase functions deploy feishu-sync --project-ref gqopwqpysoixcgdacurx
```

`SUPABASE_URL`、`SUPABASE_ANON_KEY` 和 `SUPABASE_SERVICE_ROLE_KEY` 使用 Supabase Edge Functions 提供的服务端环境变量。用户令牌表关闭 anon/authenticated 访问；函数按当前 Supabase 用户 ID 读写各自令牌。

## 使用方式

- 在“知识库”或“公众号笔记”中点击“连接飞书”，完成飞书账号授权。
- 如果此前已连接过飞书、之后才添加 `docx:document.block:convert`，必须再次点击“连接飞书”完成重新授权；旧令牌不会自动获得新权限。
- 粘贴飞书文档链接后点“从飞书导入”；这会覆盖当前条目内容，界面会先提示确认。
- 点“导出到飞书”会创建新的飞书文档，并把链接保存到当前条目。
- “打开”只在新标签页中打开已关联的飞书文档。

目前是用户主动执行的导入/导出，不是后台实时双向同步；导出会新建文档，不会覆盖飞书已有文档。导入支持常见段落、标题、列表和引用块，复杂表格/图片等块暂不保证还原。
