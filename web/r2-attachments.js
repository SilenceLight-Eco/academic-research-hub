(function () {
  'use strict';
  // Enable only after the SQL migration, Edge Function, R2 CORS and Secrets are ready.
  window.__academicR2UploadsEnabled = false;
  // Only short-lived, object-specific URLs reach the browser. No R2 keys live here.
  window.__academicR2 = function (rpc, currentSession) {
    var cached = null;
    async function capabilities() {
      var session = await currentSession();
      if (cached && cached.owner === session.user.id && Date.now() - cached.at < 30000) return cached.value;
      var result;
      try { result = await rpc({ action: 'capabilities' }, session); }
      catch (error) { if (error.status !== 404) throw error; result = { ready: false, maxBytes: 50 * 1024 * 1024 }; }
      cached = { owner: session.user.id, at: Date.now(), value: result };
      return result;
    }
    async function checkOwner(session) {
      var latest = await currentSession();
      if (latest.user.id !== session.user.id) throw new Error('账号已切换，上传已停止');
      return latest;
    }
    async function call(body, session) { return rpc(body, await checkOwner(session)); }
    function put(url, chunk, progress) {
      return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('PUT', url); xhr.timeout = 30 * 60 * 1000;
        xhr.upload.onprogress = function (event) { progress(event.loaded); };
        xhr.onload = function () { xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('文件分片上传失败，请检查 R2 CORS 配置和网络')); };
        xhr.onerror = function () { reject(new Error('无法连接 R2，请检查网络及存储桶 CORS 配置')); };
        xhr.ontimeout = function () { reject(new Error('文件分片上传超时，请重试')); };
        xhr.send(chunk);
      });
    }
    async function retry(action) {
      var error;
      for (var attempt = 0; attempt < 3; attempt++) {
        try { return await action(); }
        catch (caught) { error = caught; if (caught.status && caught.status < 500 && caught.status !== 409) throw caught; }
      }
      throw error;
    }
    return { capabilities: capabilities, recover: async function (kind, id) {
      var capability = await capabilities();
      if (!capability.ready) return;
      var session = await currentSession();
      var pending = await call({ action: 'pending', kind: kind, contextId: id }, session);
      // Recovery is account/context scoped and only touches uploads already finalizing.
      await Promise.allSettled((pending.uploads || []).map(function (upload) {
        return retry(function () { return call({ action: 'complete', id: upload.id }, session); });
      }));
    }, upload: async function (kind, id, file, session, onProgress) {
      var upload = await call({ action: 'create', kind: kind, contextId: id, name: file.name, size: file.size, type: file.type }, session);
      var finishing = false;
      try {
        if (file.size === 0) await put(upload.url, file, function () {});
        for (var offset = 0, part = 1; offset < file.size; offset += upload.partSize, part++) {
          var end = Math.min(file.size, offset + upload.partSize);
          await retry(async function () {
            var signed = await call({ action: 'part', id: upload.id, part: part }, session);
            await put(signed.url, file.slice(offset, end), function (sent) { if (onProgress) onProgress(Math.min(99, Math.floor((offset + sent) / file.size * 100))); });
          });
        }
        // Never abort an ambiguous completion: the object may already be committed.
        finishing = true;
        var result = await retry(function () { return call({ action: 'complete', id: upload.id }, session); });
        if (onProgress) onProgress(100);
        return result.file;
      } catch (error) {
        if (!finishing) await call({ action: 'abort', id: upload.id }, session).catch(function () {});
        if (finishing) error.message += '；请刷新附件列表确认，上传编号：' + upload.id;
        throw error;
      }
    }, call: async function (body) { return rpc(body, await currentSession()); } };
  };
})();
