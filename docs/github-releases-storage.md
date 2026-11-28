# 用 GitHub Releases 存放复现附件

论文复现的论文 PDF、附件、数据、代码、复现结果文档各区均提供“＋ 关联 GitHub 附件”。上传在 GitHub 原生页面完成，工作台保存附件关联并提供下载入口，不会把大文件转存到 Supabase。

已建立的专用 Release：

- 仓库：`SilenceLight-Eco/academic-research-hub`
- 标签：`research-materials`
- 页面：[论文复现公开附件](https://github.com/SilenceLight-Eco/academic-research-hub/releases/tag/research-materials)

该仓库和 Release 附件均公开。请仅上传有权公开分享的代码和复现材料。单个附件须小于 2 GiB，详见 [GitHub Release 限制](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)。

## 上传与关联

1. 在工作台选择复现任务，找到对应的文件区，点击“＋ 关联 GitHub 附件”。
2. 保留默认仓库和标签，点击“1. 前往 GitHub 上传”。
3. 在 GitHub 登录有仓库写入权限的账号，点击该 Release 的编辑按钮。将文件拖到附件上传区域，等上传完成，再点击“Update release”保存。
4. 返回工作台点击“2. 读取附件”，勾选文件，再点击“3. 关联所选”。同一分类重复关联相同链接会被阻止。
5. 点击任务右上方“立即保存”，或等待每 3 分钟、切换任务／模块时自动保存。关联会随账号同步，刷新后保留。
6. 点击已关联的文件名称即可直接从 GitHub 下载。

文件不会因关联到“数据”“附件”等分类而在 GitHub 重新上传一份。不同分类可分别关联同一文件。

## 读取失败时

公开 GitHub API 有匿名请求限流，网络也可能暂时不可达。工作台显示原因，不会把失败当作空列表。

可在 Release 页的 Assets 中，右键目标文件选择“复制链接地址”，粘贴到“或粘贴附件下载链接”，再点击“关联链接”。链接应包含 `/releases/download/`，而非 `/releases/tag/` 或自动生成的 Source code 下载地址。此方式不依赖 API，也不需要令牌。

手动关联时不读取实际文件大小，列表不显示大小。下载仍由 GitHub 处理。

## 权限、保存与删除

- 工作台不收集或保存 GitHub 密码、访问令牌，不通过第三方中转文件。
- 工作台账号与 GitHub 账号独立。上传需要 GitHub 仓库写入权限，查看公开附件不需要该权限。
- 朋友可以填写自己的公开仓库和已发布 Release 标签；不会因此获得当前项目仓库的写入权限。
- 任务和备份保存的是文件名称、链接等关联信息，未保存 GitHub 文件副本。文件内容不计入 Supabase Storage 容量。
- “移除关联”只修改任务，不删除 GitHub 原附件；需要删除原文件时，在 GitHub 中自行操作。
- GitHub 原文件被删除或 Release 改为不可访问后，工作台里的下载链接也会失效。
- 原有 Supabase/R2 附件与本地路径记录保持原来的存储方式，无需迁移或新增 Supabase 函数、表和密钥。
