(() => {
  const channel = "academic-workbench-zotero-bridge-v1";
  const allowedOrigin = "https://silencelight-eco.github.io";

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== allowedOrigin) return;
    const message = event.data;
    if (!message || message.channel !== channel || !["ping", "import"].includes(message.type)) return;
    if (typeof message.requestId !== "string") return;
    if (message.type === "import" && (!message.payload || !Array.isArray(message.payload.items) || message.payload.items.length !== 1)) return;

    chrome.runtime.sendMessage({ type: message.type === "ping" ? "academic-workbench-zotero-ping" : "academic-workbench-zotero-import", requestId: message.requestId, payload: message.payload }, (response) => {
      const runtimeError = chrome.runtime.lastError;
      window.postMessage({
        channel,
        type: "result",
        requestId: message.requestId,
        ok: Boolean(response && response.ok && !runtimeError),
        result: response && response.result,
        error: runtimeError ? runtimeError.message : (response && response.error)
      }, allowedOrigin);
    });
  });
})();
