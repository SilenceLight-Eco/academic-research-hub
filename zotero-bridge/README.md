# Zotero 桌面桥接扩展

此轻量 Chrome 扩展让已部署的学术工作台将选中的文章发送到同一台电脑上的 Zotero 桌面客户端。扩展只允许目标网页与本机 `localhost:23119` / `127.0.0.1:23119` 通信，不申请读取浏览历史、网页内容或云端账户。

## 安装一次

1. 安装并启动 Zotero 桌面版，确认 Zotero Connector 已启用。
2. 下载本项目，在 Chrome 地址栏打开 `chrome://extensions`。
3. 打开右上角“开发者模式”，选择“加载已解压的扩展程序”。
4. 选择本项目中的 `zotero-bridge` 文件夹。
   这个目录必须完整解压并长期保留，不能位于压缩包预览、临时解压或清理软件会删除的位置；安装后不要改名、移动或删除它。
5. 刷新学术工作台，在文献追踪的文章详情或文章卡片中点击“导入Zotero”。

成功时网页会收到 Connector 的实际 HTTP 响应并显示确认；未安装扩展或 Zotero 未运行时不会误报成功。若无法连接，请确认 Zotero Connector 正在运行，并在 `chrome://extensions` 重新加载扩展后刷新工作台。

## 重启后扩展从列表中消失

这与 Zotero 没启动、扩展后台休眠是不同的问题；修改网页代码或阻止后台休眠不能让被移除的扩展重新安装。

1. 先核对 Chrome 用户。点击右上角头像，切回最初安装扩展的用户，再打开 `chrome://extensions`。不同 Chrome 用户有各自的安装记录，安装在一个用户中的桥接扩展不会自动出现在另一个用户中。
2. 可为工作台创建使用该用户的快捷方式，例如：`chrome.exe --profile-directory="Default" "https://silencelight-eco.github.io/academic-research-hub/"`。`Default` 仅为示例，应以实际安装扩展的用户目录为准；在 `chrome://version` 的“个人资料路径”中确认。不要用临时 `--user-data-dir`、访客或无痕用户代替日常用户。
3. 确认加载扩展时选择的原文件夹仍在，且包含 `manifest.json`、`background.js` 和 `content.js`。不要反复解压到不同目录再加载。
4. 若同一用户、同一固定目录下，退出并重新启动 Chrome 后仍丢失，需继续检查浏览器是否重置用户配置、清理软件是否删除配置，以及 `chrome://policy` 是否存在扩展管理策略。不要手工修改 `Secure Preferences`、关闭安全软件或写入强制安装策略来绕过浏览器保护。

扩展仍在但导入失败时，应先启动桌面 Zotero，再刷新工作台并点击“测试本机连接”，不要当作插件被卸载处理。以上检查不能代替一次实际的重启验证。

Chrome 用户隔离说明：[Google Chrome 官方帮助](https://support.google.com/chrome/answer/2364824)。

## 安全范围

扩展只匹配 `https://silencelight-eco.github.io/academic-research-hub/`，并只访问 Zotero 本机 Connector 的两个回环地址。代码不会向外部服务器发送 Zotero 凭据。
