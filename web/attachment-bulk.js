(function () {
  'use strict';
  var running = new Set();
  function key(owner, kind, id) { return JSON.stringify([owner, kind, id]); }
  function busy(owner, kind, id) { return running.has(key(owner, kind, id)); }
  async function remove(options) {
    var owner = options.owner, kind = options.kind, contextId = options.contextId, api = window.__academicAttachments;
    if (!owner || kind !== 'paper' || !/^replication_[A-Za-z0-9_-]+_(paper|supplement|data|code|result)$/.test(contextId || '')) throw new Error('请选择有效的论文复现材料分类');
    if (!api || !api.identity || !api.remove) throw new Error('附件组件尚未就绪，请刷新页面后重试');
    var seen = new Set(), files = (options.files || []).map(function (file) { return { id: String(file.id || ''), name: String(file.file_name || file.name || '未命名文件') }; }).filter(function (file) { if (!file.id || seen.has(file.id)) return false; seen.add(file.id); return true; });
    if (!files.length || files.length > 200) throw new Error('请选择当前列表中的文件，每批最多200个');
    var batchKey = key(owner, kind, contextId);
    if (running.has(batchKey)) throw new Error('当前分类已有文件操作正在进行');
    running.add(batchKey);
    var result = { removed: [], failed: [], remaining: [], stopped: false, reason: '' };
    function progress(index, name) { try { if (options.progress) options.progress({ index: index, total: files.length, name: name, removed: result.removed.length, failed: result.failed.length }); } catch (_) { /* A closed view must not change the confirmed file scope. */ } }
    try {
      for (var i = 0; i < files.length; i++) {
        try { if (await api.identity() !== owner) throw new Error('账号已切换，已停止后续删除'); }
        catch (error) { result.stopped = true; result.reason = error.message || '登录状态已变化，已停止删除'; break; }
        var file = files[i]; progress(i, file.name);
        try { await api.remove(file.id, { owner: owner, kind: kind, contextId: contextId }); result.removed.push(file.id); }
        catch (error) { result.failed.push({ id: file.id, name: file.name, error: error.message || '删除失败' }); }
        progress(i + 1, file.name);
      }
      result.remaining = files.filter(function (file) { return !result.removed.includes(file.id); }).map(function (file) { return file.id; });
      return result;
    } finally { running.delete(batchKey); }
  }
  function summary(result) {
    return '已删除 ' + result.removed.length + ' 个文件' + (result.failed.length ? '，失败 ' + result.failed.length + ' 个：' + result.failed.map(function (file) { return file.name + '（' + file.error + '）'; }).join('；') : '') + (result.stopped ? '。' + result.reason : '') + (result.remaining.length ? '；未删除的文件已保留勾选，可重试' : '');
  }
  window.__academicAttachmentBulk = { busy: busy, remove: remove, summary: summary };
})();
