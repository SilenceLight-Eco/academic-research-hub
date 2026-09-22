# Zotero 桌面桥接扩展

此轻量 Chrome 扩展让已部署的学术工作台将选中的文章发送到同一台电脑上的 Zotero 桌面客户端。扩展只允许目标网页与本机 `localhost:23119` / `127.0.0.1:23119` 通信，不申请读取浏览历史、网页内容或云端账户。

## 安装一次

1. 安装并启动 Zotero 桌面版，确认 Zotero Connector 已启用。
2. 下载本项目，在 Chrome 地址栏打开 `chrome://extensions`。
3. 打开右上角“开发者模式”，选择“加载已解压的扩展程序”。
4. 选择本项目中的 `zotero-bridge` 文件夹。
5. 刷新学术工作台，在文献追踪的文章详情或文章卡片中点击“导入桌面 Zotero”。

成功时网页会收到 Connector 的实际 HTTP 响应并显示确认；未安装扩展或 Zotero 未运行时不会误报成功。若无法连接，请确认 Zotero Connector 正在运行，并在 `chrome://extensions` 重新加载扩展后刷新工作台。

## 安全范围

扩展只匹配 `https://silencelight-eco.github.io/academic-research-hub/`，并只访问 Zotero 本机 Connector 的两个回环地址。代码不会向外部服务器发送 Zotero 凭据。
