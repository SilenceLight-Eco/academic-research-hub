(() => {
  const channel = "academic-workbench-zotero-bridge-v1";
  const allowedOrigin = "https://silencelight-eco.github.io";

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== allowedOrigin) return;
    const message = event.data;
    if (!message || message.channel !== channel || message.type !== "import") return;
    if (typeof message.requestId !== "string" || !message.payload || !Array.isArray(message.payload.items) || message.payload.items.length !== 1) return;

    chrome.runtime.sendMessage({ type: "academic-workbench-zotero-import", requestId: message.requestId, payload: message.payload }, (response) => {
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
