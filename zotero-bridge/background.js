chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "academic-workbench-zotero-import") return false;
  if (!message.payload || !Array.isArray(message.payload.items) || message.payload.items.length !== 1) {
    sendResponse({ ok: false, error: "导入内容无效" });
    return false;
  }

  (async () => {
    const endpoints = ["http://localhost:23119/connector/saveItems", "http://127.0.0.1:23119/connector/saveItems"];
    let lastError = "Zotero Connector 没有响应";
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Zotero-Allowed-Request": "true"
          },
          body: JSON.stringify(message.payload),
          cache: "no-store",
          credentials: "omit"
        });
        const text = await response.text();
        if (!response.ok) {
          lastError = `Zotero Connector 返回 HTTP ${response.status}${text ? `：${text.slice(0, 180)}` : ""}`;
          continue;
        }
        let result = {};
        try { result = text ? JSON.parse(text) : {}; } catch (_) { result = { response: text.slice(0, 180) }; }
        sendResponse({ ok: true, result: { status: response.status, body: result } });
        return;
      } catch (error) {
        lastError = error && error.message ? error.message : lastError;
      }
    }
    sendResponse({ ok: false, error: `无法连接 Zotero Connector。请确认桌面 Zotero 已启动并开启 Connector。${lastError}` });
  })();
  return true;
});
