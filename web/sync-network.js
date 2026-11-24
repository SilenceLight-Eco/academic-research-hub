(function () {
  'use strict';
  window.__academicSyncErrorMessage = function (error, offline) {
    if (offline) return '网络离线，联网后可重试';
    var message = String(error && error.message || error || '未知错误');
    var code = String(error && (error.errorCode || error.code) || '');
    var status = Number(error && (error.errorStatus || error.status));
    if (error && error.workspaceConflict || status === 409) return '数据发生冲突，请先处理同步冲突';
    if (status === 401 || /PGRST30[123]|JWT|token.*expired|refresh.*token|登录.*过期/i.test(code + ' ' + message)) return '登录凭证已失效，请重新登录';
    if (status === 403 || code === '42501' || /permission denied|row.level security/i.test(message)) return '云端访问权限不足，请检查账号的数据权限';
    if (/CLOUD_TIMEOUT|AbortError|TimeoutError|timeout|timed out|超时/i.test(code + ' ' + message)) return '云端请求超时，保存结果待确认，可重试';
    if (/failed to fetch|fetch failed|network|load failed|网络/i.test(message)) return '无法连接云端，请检查网络后重试';
    return message.replace(/https?:\/\/\S+/g, '[服务地址]').replace(/\s+/g, ' ').slice(0, 160);
  };
  window.__academicWaitForSession = function (task) {
    var timer;
    return Promise.race([task, new Promise(function (_resolve, reject) {
      timer = setTimeout(function () { reject(new Error('登录状态检查超时，请重试')); }, 30000);
    })]).finally(function () { clearTimeout(timer); });
  };
  window.__academicFetchWithTimeout = function (nativeFetch) {
    return async function (input, options) {
      var controller = new AbortController();
      var signal = options && options.signal || input && input.signal;
      var timedOut = false;
      var address = typeof input === 'string' ? input : input.url;
      var duration = /\/storage\/v1\//.test(address) ? 120000 : 25000;
      function abortFromCaller() { controller.abort(signal.reason); }
      if (signal) {
        if (signal.aborted) abortFromCaller();
        else signal.addEventListener('abort', abortFromCaller, { once: true });
      }
      var timer = setTimeout(function () { timedOut = true; controller.abort(); }, duration);
      try {
        var response = await nativeFetch(input, Object.assign({}, options, { signal: controller.signal }));
        // Keep the deadline active while JSON is downloaded, including large workspaces.
        if (/\/(rest|auth)\/v1\//.test(address) && response.body) {
          var bytes = await response.arrayBuffer();
          return new Response([204, 205, 304].indexOf(response.status) >= 0 ? null : bytes, { status: response.status, statusText: response.statusText, headers: response.headers });
        }
        return response;
      } catch (error) {
        if (timedOut) throw Object.assign(new Error('云端请求超时（CLOUD_TIMEOUT），保存结果待确认'), { code: 'CLOUD_TIMEOUT' });
        throw error;
      } finally {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', abortFromCaller);
      }
    };
  };
})();
