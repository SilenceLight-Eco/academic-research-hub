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

  function setStatus(message, error) {
    status.textContent = message || '';
    status.classList.toggle('is-error', Boolean(error));
  }

  function readableSize(size) {
    var bytes = Number(size) || 0;
    return bytes < 1024 * 1024 ? Math.max(1, Math.round(bytes / 1024)) + ' KB' : (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function renderFiles() {
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
      row.append(detail, actions);
      list.appendChild(row);
    });
  }

  async function loadFiles() {
    var context = current;
    if (!context) return;
    setStatus('正在读取附件…');
    try {
      files = await window.__academicAttachments.list(context.kind, context.id);
      if (current !== context) return;
      renderFiles();
      setStatus(files.length ? '共 ' + files.length + ' 个附件' : '');
    } catch (error) {
      if (current === context) setStatus(error.message || '读取附件失败', true);
    }
  }

  function openFiles(kind, id, title) {
    if (!id) { window.alert('请先选择已保存的内容'); return; }
    if (!window.__academicAttachments) { window.alert('附件仅在登录后的云端网页版中可用'); return; }
    current = { kind: kind, id: String(id) };
    files = [];
    renderFiles();
    document.getElementById('fileModalTitle').textContent = (title || '当前内容') + ' · 附件';
    modal.hidden = false;
    loadFiles();
  }

  function closeFiles() {
    if (busy) return;
    modal.hidden = true;
    current = null;
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
    openFiles('paper', event.data.id, event.data.title || '论文');
  });

  document.getElementById('fileModalClose').addEventListener('click', closeFiles);
  document.getElementById('fileModalBackdrop').addEventListener('click', closeFiles);
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && !modal.hidden) closeFiles(); });
  uploadButton.addEventListener('click', function () { if (!busy) input.click(); });
  input.addEventListener('change', async function () {
    var selected = Array.from(input.files || []);
    input.value = '';
    if (!selected.length || !current) return;
    var context = current;
    busy = true;
    uploadButton.disabled = true;
    try {
      for (var i = 0; i < selected.length; i++) {
        var file = selected[i];
        if (file.size > 50 * 1024 * 1024) throw new Error(file.name + ' 超过 50 MB 上限');
        setStatus('正在上传 ' + (i + 1) + '/' + selected.length + '：' + file.name + '（0%）');
        await window.__academicAttachments.upload(context.kind, context.id, file, function (percent) {
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
    }
  });

  list.addEventListener('click', async function (event) {
    var button = event.target.closest('[data-file-action]');
    if (!button || busy) return;
    var file = files.find(function (item) { return item.id === button.dataset.fileId; });
    if (!file) return;
    if (button.dataset.fileAction === 'remove' && !window.confirm('确定永久删除附件“' + file.file_name + '”吗？')) return;
    busy = true;
    button.disabled = true;
    setStatus(button.dataset.fileAction === 'remove' ? '正在删除附件…' : '正在下载附件…');
    try {
      if (button.dataset.fileAction === 'remove') {
        await window.__academicAttachments.remove(file.id);
        await loadFiles();
        setStatus('附件已删除');
      } else {
        var result = await window.__academicAttachments.download(file.id);
        var url = URL.createObjectURL(result.blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = result.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
        setStatus('已开始下载 ' + result.name);
      }
    } catch (error) {
      setStatus(error.message || '操作失败', true);
    } finally {
      busy = false;
      button.disabled = false;
    }
  });
})();
