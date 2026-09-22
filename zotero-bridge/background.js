chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const allowedTypes = ["academic-workbench-zotero-import", "academic-workbench-zotero-ping", "academic-workbench-zotero-collections"];
  if (!message || !allowedTypes.includes(message.type)) return false;
  const isPing = message.type === "academic-workbench-zotero-ping";
  const isCollections = message.type === "academic-workbench-zotero-collections";

  async function connectorRequest(endpoint, payload) {
    let lastError = "Zotero Connector 没有响应";
    for (const host of ["http://localhost:23119", "http://127.0.0.1:23119"]) {
      try {
        const response = await fetch(`${host}/connector/${endpoint}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Zotero-Allowed-Request": "true",
            "X-Zotero-Connector-API-Version": "3"
          },
          body: JSON.stringify(payload || {}),
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
        return { ok: true, result };
      } catch (error) {
        lastError = error && error.message ? error.message : lastError;
      }
    }
    return { ok: false, error: lastError };
  }

  if (isPing) {
    (async () => {
      let lastError = "Zotero Connector 没有响应";
      for (const endpoint of ["http://localhost:23119/connector/ping", "http://127.0.0.1:23119/connector/ping"]) {
        try {
          const response = await fetch(endpoint, { method: "GET", cache: "no-store", credentials: "omit" });
          if (!response.ok) { lastError = `Zotero Connector 返回 HTTP ${response.status}`; continue; }
          sendResponse({ ok: true, result: { version: response.headers.get("X-Zotero-Version") || "" } });
          return;
        } catch (error) { lastError = error && error.message ? error.message : lastError; }
      }
      sendResponse({ ok: false, error: `无法连接 Zotero Connector。请确认桌面 Zotero 已启动。${lastError}` });
    })();
    return true;
  }

  if (isCollections) {
    connectorRequest("getSelectedCollection", {}).then((response) => {
      sendResponse(response.ok ? response : { ok: false, error: `无法读取 Zotero 分类。${response.error}` });
    });
    return true;
  }

  if (!message.payload || !Array.isArray(message.payload.items) || message.payload.items.length !== 1) {
    sendResponse({ ok: false, error: "导入内容无效" });
    return false;
  }

  (async () => {
    const save = await connectorRequest("saveItems", message.payload);
    if (!save.ok) {
      sendResponse({ ok: false, error: `无法连接 Zotero Connector 或保存条目失败。请确认 Zotero 桌面已启动并开启 Connector。${save.error}` });
      return;
    }

    const target = String(message.payload.target || "");
    if (!target) {
      sendResponse({ ok: true, result: { status: 201, body: save.result, collectionApplied: true } });
      return;
    }

    const moved = await connectorRequest("updateSession", { sessionID: message.payload.sessionID, target });
    sendResponse({ ok: true, result: { status: 201, body: save.result, collectionApplied: moved.ok, collectionError: moved.ok ? "" : moved.error } });
  })();
  return true;
});
