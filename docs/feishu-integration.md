# 飞书文档联动配置

知识库与公众号笔记中的飞书链接会保存在当前工作台账号的云端数据中。关联链接可以直接打开；“导出到飞书”通过 Supabase Edge Function 调用飞书 API，应用密钥不会发送到浏览器。

## 部署导出服务

1. 在飞书开放平台创建一个自建应用，启用文档能力，并申请创建/编辑新版文档、Markdown 转文档块所需的权限。发布应用或将目标账号加入应用可用范围。
2. 在 Supabase 项目 `gqopwqpysoixcgdacurx` 的 Edge Function Secrets 中设置 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET`。不要把应用密钥提交到仓库或发到聊天中。
3. 在本地登录 Supabase CLI 后，从仓库根目录部署函数：

   ```powershell
   supabase login
   supabase functions deploy feishu-export --project-ref gqopwqpysoixcgdacurx
   supabase secrets set FEISHU_APP_ID=你的应用ID FEISHU_APP_SECRET=你的应用密钥 --project-ref gqopwqpysoixcgdacurx
   ```

   也可以在 Supabase 控制台先添加密钥，再部署函数。密钥只在服务端读取。

## 使用方式

- 在“知识库”或“公众号笔记”编辑区粘贴已有飞书文档链接，链接会随工作台自动保存；点“打开”可跳转到飞书。
- 点“导出到飞书”会创建一份新的飞书文档，并在原条目中保存新文档的链接和编号。再次导出会新建文档，不会覆盖之前的飞书文档。

导出使用应用的飞书租户身份，因此飞书自建应用需要在要创建文档的租户内启用，并具有相应文档权限。若每位工作台用户需要导出到各自不同租户的飞书个人空间，需要进一步增加飞书 OAuth 用户授权流程。
