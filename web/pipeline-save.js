(function () {
  'use strict';
  var keys = ['research-hub-crossref-email', 'research-hub-crossref-citations-v1', 'research-hub-stages-v1', 'research-hub-fields-v1', 'research-hub-cards-v1', 'research-hub-theme', 'research-hub-unassigned-data-code-v1'];
  var pending = new Map(), revision = 0, saving = false;
  var nativeSet = Storage.prototype.setItem, nativeGet = Storage.prototype.getItem, nativeRemove = Storage.prototype.removeItem;
  var button, status;
  function markChanged() {
    revision++;
    if (status && !saving) { status.textContent = '修改会自动保存'; status.dataset.state = 'pending'; }
  }
  // Preserve failed writes in this tab so a later manual save can retry the full
  // value, including subsequent edits, rather than silently saving stale data.
  Storage.prototype.setItem = function (key, value) {
    if (this !== localStorage || keys.indexOf(key) < 0) return nativeSet.call(this, key, value);
    markChanged();
    try { nativeSet.call(this, key, value); pending.delete(key); }
    catch (error) { pending.set(key, String(value)); throw error; }
  };
  Storage.prototype.getItem = function (key) {
    return this === localStorage && pending.has(key) ? pending.get(key) : nativeGet.call(this, key);
  };
  Storage.prototype.removeItem = function (key) {
    nativeRemove.call(this, key);
    if (this === localStorage) pending.delete(key);
  };
  window.__academicPipelineFlushLocalWrites = function () {
    pending.forEach(function (value, key) { nativeSet.call(localStorage, key, value); pending.delete(key); });
    // A storage check must succeed even if there was nothing to retry.
    var key = 'research-hub-fields-v1';
    var value = nativeGet.call(localStorage, key);
    if (value !== null) nativeSet.call(localStorage, key, value);
    else { nativeSet.call(localStorage, key, '{}'); nativeRemove.call(localStorage, key); }
  };
  function commitCurrentEdits() {
    Array.from(document.querySelectorAll('.editable .edit-input')).forEach(function (input) {
      var span = input.closest('.editable');
      var paper = span && findPaperByKey(span.dataset.editId);
      if (paper) commitEditField(span, input, paper, span.dataset.editField);
    });
    var active = document.activeElement;
    if (active && active !== button && typeof active.blur === 'function') active.blur();
  }
  async function saveNow() {
    if (saving) return;
    saving = true;
    button.disabled = true; button.textContent = '正在保存…';
    status.textContent = '正在保存…'; status.dataset.state = 'saving';
    var localSaved = false, timeout;
    try {
      commitCurrentEdits();
      window.__academicPipelineFlushLocalWrites();
      localSaved = true;
      var savedRevision = revision;
      if (typeof window.__academicPipelineCloudSave !== 'function') throw new Error('云端组件尚未就绪，请稍后重试');
      var result = await Promise.race([
        window.__academicPipelineCloudSave(),
        new Promise(function (_, reject) { timeout = setTimeout(function () { reject(new Error('云端保存结果尚未确认，请稍后重试')); }, 25000); })
      ]);
      if (!result || ['cloud', 'local'].indexOf(result.scope) < 0) throw new Error('未收到保存确认');
      var time = new Date().toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' });
      status.textContent = (result.scope === 'cloud' ? '已保存到云端 ' : '已保存本机（未登录） ') + time + (revision !== savedRevision ? ' · 仍有新修改' : '');
      status.dataset.state = revision !== savedRevision ? 'pending' : 'saved';
    } catch (error) {
      status.textContent = (localSaved ? '已保存本机；' : '保存失败；') + (error.message || '请重试');
      status.dataset.state = 'error';
    } finally {
      clearTimeout(timeout); saving = false; button.disabled = false; button.textContent = '立即保存';
    }
  }
  function initialize() {
    var host = document.querySelector('.topbar-right');
    if (!host || document.getElementById('pipelineSaveNow')) return;
    var controls = document.createElement('div'); controls.className = 'pipeline-save-controls';
    status = document.createElement('span'); status.id = 'pipelineSaveStatus'; status.className = 'pipeline-save-status';
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.textContent = '修改会自动保存';
    button = document.createElement('button'); button.id = 'pipelineSaveNow'; button.className = 'btn primary'; button.type = 'button';
    button.textContent = '立即保存'; button.setAttribute('aria-label', '立即保存论文管线');
    button.addEventListener('mousedown', function (event) { event.preventDefault(); });
    button.addEventListener('click', saveNow);
    controls.append(status, button); host.appendChild(controls);
  }
  document.addEventListener('input', function (event) {
    if (event.target.closest && event.target.closest('.editable, .research-resources')) markChanged();
  });
  document.addEventListener('DOMContentLoaded', initialize);
  window.addEventListener('beforeunload', function (event) {
    if (!pending.size) return;
    event.preventDefault(); event.returnValue = '';
  });
})();
