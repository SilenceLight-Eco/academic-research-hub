(function () {
  'use strict';

  var modal = document.getElementById('fileModal');
  var list = document.getElementById('fileList');
  var status = document.getElementById('fileStatus');
  var input = document.getElementById('fileInput');
  var uploadButton = document.getElementById('fileUpload');
  var current = null;
  var busy = false;
  var files = [];
  var loadRequest = 0;
  var selectedIds = [], review = null;
  var bulkToolbar = document.getElementById('fileBulkToolbar'), bulkReview = document.getElementById('fileBulkReview');
  function escaped(value) { return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function bulkContext() { return current && current.owner && current.kind === 'paper' && /^replication_[A-Za-z0-9_-]+_(paper|supplement|data|code|result)$/.test(current.id) && window.__academicAttachmentBulk; }
  function contextBusy() { return busy || Boolean(bulkContext() && window.__academicAttachmentBulk.busy(current.owner, current.kind, current.id)); }
  function renderBulk() {
    bulkToolbar.hidden = !bulkContext() || !files.length; bulkReview.hidden = !review;
    selectedIds = selectedIds.filter(function (id) { return files.some(function (file) { return String(file.id) === id; }); });
    bulkToolbar.innerHTML = '<label><input type="checkbox" data-file-bulk-all' + (files.length && selectedIds.length === files.length ? ' checked' : '') + (contextBusy() || review ? ' disabled' : '') + '>全选当前列表</label><span>已选 ' + selectedIds.length + ' / ' + files.length + '</span><button type="button" data-file-bulk="review"' + (!selectedIds.length || contextBusy() || review ? ' disabled' : '') + '>删除所选</button>';
    bulkReview.innerHTML = review ? '<p>将永久删除以下 ' + review.files.length + ' 个文件，此操作无法恢复。</p><ul>' + review.files.map(function (file) { return '<li>' + escaped(file.file_name) + '</li>'; }).join('') + '</ul><div><button type="button" data-file-bulk="confirm" data-file-bulk-token="' + review.token + '">确认删除 ' + review.files.length + ' 个文件</button><button type="button" data-file-bulk="cancel">取消</button></div>' : '';
    if (bulkContext()) uploadButton.disabled = contextBusy() || Boolean(review);
    var all = bulkToolbar.querySelector && bulkToolbar.querySelector('[data-file-bulk-all]'); if (all) all.indeterminate = selectedIds.length > 0 && selectedIds.length < files.length;
  }

  function notifyPipelineFilesChanged(context) {
    if (context) window.dispatchEvent(new CustomEvent('academic-attachments-changed', { detail: { kind: context.kind, contextId: context.id } }));
    var frame = document.querySelector('.research-hub-frame');
    if (!context || context.kind !== 'paper' || !frame || !frame.contentWindow || typeof frame.contentWindow.postMessage !== 'function') return;
    frame.contentWindow.postMessage({ type: 'academic-research-hub-materials-changed', contextId: context.id }, location.origin);
  }

  function setStatus(message, error) {
    status.textContent = message || '';
    status.classList.toggle('is-error', Boolean(error));
  }

  function readableSize(size) {
    var bytes = Number(size) || 0;
    return bytes < 1024 * 1024 ? Math.max(1, Math.round(bytes / 1024)) + ' KB' : (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function renderFiles() {
    renderBulk();
    list.replaceChildren();
    if (!files.length) {
      var empty = document.createElement('p');
      empty.className = 'file-empty';
      empty.textContent = '还没有附件。上传后，同一账号可在其他设备下载。';
      list.appendChild(empty);
      return;
    }
    files.forEach(function (file) {
      var row = document.createElement('div');
      row.className = 'file-row';
      var detail = document.createElement('div');
      detail.className = 'file-row-detail';
      var name = document.createElement('strong');
      name.textContent = file.file_name;
      name.title = file.file_name;
      var meta = document.createElement('small');
      meta.textContent = readableSize(file.file_size) + ' · ' + new Date(file.created_at).toLocaleString('zh-CN');
      detail.append(name, meta);
      var actions = document.createElement('div');
      actions.className = 'file-row-actions';
      var download = document.createElement('button');
      download.type = 'button';
      download.textContent = '下载';
      download.dataset.fileAction = 'download';
      download.dataset.fileId = file.id;
      var remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '删除';
      remove.dataset.fileAction = 'remove';
      remove.dataset.fileId = file.id;
      actions.append(download, remove);
      if (bulkContext()) {
        var checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = selectedIds.includes(String(file.id)); checkbox.disabled = contextBusy() || Boolean(review);
        checkbox.dataset.fileBulkSelect = String(file.id); checkbox.setAttribute('aria-label', '选择文件：' + file.file_name);
        row.appendChild(checkbox);
      }
      row.append(detail, actions);
      download.disabled = contextBusy(); remove.disabled = contextBusy() || Boolean(review);
      list.appendChild(row);
    });
  }

  async function loadFiles() {
    var context = current;
    if (!context) return;
    var request = ++loadRequest;
    setStatus('正在读取附件…');
    try {
      if (window.__academicAttachments.identity) context.owner = await window.__academicAttachments.identity();
      var loaded = await window.__academicAttachments.list(context.kind, context.id);
      if (current !== context || request !== loadRequest) return;
      files = loaded;
      review = null;
      renderFiles();
      setStatus(files.length ? '共 ' + files.length + ' 个附件' : '');
    } catch (error) {
      if (current === context && request === loadRequest) setStatus(error.message || '读取附件失败', true);
    }
  }

  function openFiles(kind, id, title, description) {
    if (busy) { setStatus('当前附件操作尚未结束，请稍候再切换材料分类。'); return false; }
    if (!id) { window.alert('请先选择已保存的内容'); return false; }
    if (!window.__academicAttachments) { window.alert('附件仅在登录后的云端网页版中可用'); return false; }
    current = { kind: kind, id: String(id) };
    files = []; selectedIds = []; review = null;
    renderFiles();
    document.getElementById('fileModalTitle').textContent = (title || '当前内容') + ' · 附件';
    var contextDescription = document.getElementById('fileContextDescription');
    contextDescription.textContent = typeof description === 'string' ? description.slice(0, 500) : '';
    contextDescription.hidden = !contextDescription.textContent;
    modal.hidden = false;
    loadFiles();
    return true;
  }

  window.__academicOpenAttachments = openFiles;

  function closeFiles() {
    if (busy) return;
    modal.hidden = true;
    current = null;
    selectedIds = []; review = null; renderBulk();
    input.value = '';
    setStatus('');
  }

  document.addEventListener('click', function (event) {
    var trigger = event.target.closest('[data-file-context]');
    if (!trigger) return;
    var kind = trigger.dataset.fileContext;
    var context = window.__academicAttachmentContext && window.__academicAttachmentContext(kind);
    if (context) openFiles(kind, context.id, context.title);
    else window.alert('请先选择已保存的内容');
  });

  window.addEventListener('message', function (event) {
    var frame = document.querySelector('.research-hub-frame');
    if (event.origin !== location.origin || !frame || event.source !== frame.contentWindow) return;
    if (!event.data || event.data.type !== 'academic-research-hub-open-attachments') return;
    openFiles('paper', event.data.id, event.data.title || '论文', event.data.description);
  });

  document.getElementById('fileModalClose').addEventListener('click', closeFiles);
  window.addEventListener('academic-account-changed', function () { current = null; loadRequest++; files = []; selectedIds = []; review = null; modal.hidden = true; renderFiles(); setStatus(''); });
  window.addEventListener('academic-attachments-changed', function (event) { if (current && !busy && event.detail && event.detail.kind === current.kind && event.detail.contextId === current.id) loadFiles(); });
  function changeSelection(event) {
    if (!bulkContext() || contextBusy() || review) return;
    var all = event.target.closest('[data-file-bulk-all]'), one = event.target.closest('[data-file-bulk-select]');
    if (all) selectedIds = all.checked ? files.map(function (file) { return String(file.id); }) : [];
    else if (one && files.some(function (file) { return String(file.id) === one.dataset.fileBulkSelect; })) { selectedIds = selectedIds.filter(function (id) { return id !== one.dataset.fileBulkSelect; }); if (one.checked) selectedIds.push(one.dataset.fileBulkSelect); }
    else return;
    renderFiles();
  }
  bulkToolbar.addEventListener('change', changeSelection); list.addEventListener('change', changeSelection);
  async function bulkAction(event) {
    var button = event.target.closest('[data-file-bulk]'); if (!button || !bulkContext() || contextBusy()) return;
    var action = button.dataset.fileBulk;
    if (action === 'cancel') { review = null; renderFiles(); return; }
    if (action === 'review') {
      var chosen = files.filter(function (file) { return selectedIds.includes(String(file.id)); }).map(function (file) { return { id: String(file.id), file_name: file.file_name }; });
      if (!chosen.length) return;
      review = { files: chosen, context: current, owner: current.owner, token: Date.now() + '-' + Math.random().toString(36).slice(2) }; renderFiles(); return;
    }
    var confirmed = review;
    if (action !== 'confirm' || !confirmed || confirmed.context !== current || button.dataset.fileBulkToken !== confirmed.token) return;
    var context = current; review = null; busy = true; uploadButton.disabled = true; renderFiles();
    try {
      var result = await window.__academicAttachmentBulk.remove({ owner: confirmed.owner, kind: context.kind, contextId: context.id, files: confirmed.files, progress: function (progress) { if (current === context) setStatus('正在删除 ' + progress.index + '/' + progress.total + '：' + progress.name); } });
      if (current !== context) return;
      if (await window.__academicAttachments.identity() !== confirmed.owner) { modal.hidden = true; current = null; files = []; selectedIds = []; renderFiles(); return; }
      selectedIds = result.remaining;
      files = files.filter(function (file) { return !result.removed.includes(String(file.id)); });
      await loadFiles();
      if (current === context) setStatus(window.__academicAttachmentBulk.summary(result), result.failed.length || result.stopped);
    } catch (error) { if (current === context) setStatus(error.message || '批量删除失败，请重试', true); }
    finally { if (current === context) notifyPipelineFilesChanged(context); busy = false; uploadButton.disabled = false; renderFiles(); }
  }
  bulkToolbar.addEventListener('click', bulkAction); bulkReview.addEventListener('click', bulkAction);
  document.getElementById('fileModalBackdrop').addEventListener('click', closeFiles);
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && !modal.hidden) closeFiles(); });
  uploadButton.addEventListener('click', function () { if (!contextBusy()) input.click(); });
  input.addEventListener('change', async function () {
    if (contextBusy()) return;
    var selected = Array.from(input.files || []);
    input.value = '';
    if (!selected.length || !current) return;
    var context = current;
    busy = true;
    uploadButton.disabled = true;
    try {
      for (var i = 0; i < selected.length; i++) {
        if (current !== context) throw new Error('材料或账号已切换，已停止后续上传');
        var file = selected[i];
        setStatus('正在上传 ' + (i + 1) + '/' + selected.length + '：' + file.name + '（0%）');
        await window.__academicAttachments.upload(context.kind, context.id, file, function (percent) {
          if (current !== context) return;
          setStatus('正在上传 ' + (i + 1) + '/' + selected.length + '：' + file.name + '（' + percent + '%）');
        });
      }
      await loadFiles();
      setStatus('上传完成，附件已同步到云端');
    } catch (error) {
      await loadFiles();
      setStatus(error.message || '上传失败，请稍后重试', true);
    } finally {
      busy = false;
      uploadButton.disabled = false;
      renderFiles(); if (current === context) notifyPipelineFilesChanged(context);
    }
  });

  list.addEventListener('click', async function (event) {
    var button = event.target.closest('[data-file-action]');
    if (!button || contextBusy()) return;
    if (review && button.dataset.fileAction === 'remove') return;
    var file = files.find(function (item) { return item.id === button.dataset.fileId; });
    if (!file) return;
    if (button.dataset.fileAction === 'remove' && !window.confirm('确定永久删除附件“' + file.file_name + '”吗？')) return;
    var context = current;
    busy = true;
    button.disabled = true;
    setStatus(button.dataset.fileAction === 'remove' ? '正在删除附件…' : '正在下载附件…');
    try {
      if (button.dataset.fileAction === 'remove') {
        await window.__academicAttachments.remove(file.id, context && context.owner ? { owner: context.owner, kind: context.kind, contextId: context.id } : undefined);
        await loadFiles();
        setStatus('附件已删除');
      } else {
        var result = await window.__academicAttachments.download(file.id);
        if (current !== context) return;
        var url = result.url || URL.createObjectURL(result.blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = result.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        if (!result.url) setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
        setStatus('已开始下载 ' + result.name);
      }
    } catch (error) {
      setStatus(error.message || '操作失败', true);
    } finally {
      busy = false;
      button.disabled = false;
      renderFiles(); if (button.dataset.fileAction === 'remove' && current === context) notifyPipelineFilesChanged(current);
    }
  });
})();
