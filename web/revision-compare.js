(function () {
  'use strict';
  var Core = window.RevisionCompareCore, drafts = new Map(), zipPromise;
  var release = '20261112-01';
  function escape(value) { return Core.escape(value); }
  function state(roundId) {
    if (!drafts.has(roundId)) drafts.set(roundId, { before: { name: '原始版本', text: '' }, after: { name: '修改版本', text: '' },
      revision: 0, beforeTicket: 0, afterTicket: 0, dirty: false, result: null, worker: null, activeChange: -1, onlyChanges: false, status: '', error: false, saving: false });
    return drafts.get(roundId);
  }
  function rootFor(roundId) { return Array.from(document.querySelectorAll('[data-rc-round]')).find(function (root) { return root.dataset.rcRound === roundId; }); }
  function setStatus(roundId, message, error) {
    var draft = state(roundId); draft.status = message; draft.error = Boolean(error);
    var root = rootFor(roundId), target = root && root.querySelector('[data-rc-status]');
    if (target) { target.textContent = message; target.classList.toggle('is-error', draft.error); }
  }
  function stopWorker(draft) { if (draft.worker) { draft.worker.terminate(); draft.worker = null; } }
  function invalidate(roundId) {
    var draft = state(roundId); draft.revision++; draft.dirty = true; draft.result = null; stopWorker(draft);
    setStatus(roundId, '内容已修改，请重新对比；点击“保存本轮对比”可保留两个版本');
    renderResult(roundId);
  }
  function render(key, reference, round) {
    if (!round || !round.id) return '<div class="rc-create"><button class="btn" type="button" onclick="RevisionComparison.open(\'' + escape(key) + '\',' + (reference === null ? 'null' : Number(reference)) + ')">版本对比</button></div>';
    var draft = state(round.id);
    return '<details class="revision-comparison" data-rc-round="' + escape(round.id) + '" data-rc-paper="' + escape(key) + '"><summary>版本对比</summary><div class="rc-body">' +
      '<p class="muted">导入文件或粘贴文字。Word 提取正文及表格文字；本页暂存编辑，点击保存可在其他设备读取本轮对比。</p>' +
      '<div class="rc-inputs">' + ['before', 'after'].map(function (side, index) {
        return '<div class="rc-version"><label>' + (index ? '修改版本' : '原始版本') + '<input class="select" data-rc-name="' + side + '" maxlength="120" value="' + escape(draft[side].name) + '"></label>' +
          '<label class="rc-file">导入 Word / Markdown / TXT<input type="file" data-rc-file="' + side + '" accept=".docx,.md,.markdown,.txt"></label>' +
          '<textarea data-rc-text="' + side + '" aria-label="' + (index ? '修改版本正文' : '原始版本正文') + '" spellcheck="false" placeholder="也可以直接粘贴文字">' + escape(draft[side].text) + '</textarea></div>';
      }).join('') + '</div><div class="rc-actions"><button class="btn primary" type="button" data-rc-action="compare">开始对比</button><button class="btn" type="button" data-rc-action="save"' + (draft.saving ? ' disabled' : '') + '>保存本轮对比</button><button class="btn" type="button" data-rc-action="load">读取最近保存</button><button class="btn" type="button" data-rc-action="export"' + (!draft.result ? ' disabled' : '') + '>导出对比报告</button></div>' +
      '<p class="rc-status' + (draft.error ? ' is-error' : '') + '" data-rc-status role="status" aria-live="polite">' + escape(draft.status) + '</p><div data-rc-output>' + resultHtml(draft) + '</div></div></details>';
  }
  function resultHtml(draft) {
    if (!draft.result) return '';
    var stats = draft.result.stats;
    return '<div class="rc-summary">新增 ' + stats.added + ' · 删除 ' + stats.removed + ' · 修改 ' + stats.changed + ' · 移动 ' + stats.moved + ' 段</div><div class="rc-actions"><label><input type="checkbox" data-rc-only' + (draft.onlyChanges ? ' checked' : '') + '>只看修改</label><button class="btn" type="button" data-rc-action="previous">上一处修改</button><span data-rc-position></span><button class="btn" type="button" data-rc-action="next">下一处修改</button></div>' +
      '<div class="rc-results' + (draft.onlyChanges ? ' rc-changes-only' : '') + '"><div class="rc-result-heading"><strong>' + escape(draft.before.name) + '</strong><strong>' + escape(draft.after.name) + '</strong></div>' + draft.result.rows.map(Core.rowHtml).join('') + '</div>';
  }
  function renderResult(roundId) {
    var root = rootFor(roundId); if (!root) return;
    var draft = state(roundId); root.querySelector('[data-rc-output]').innerHTML = resultHtml(draft);
    root.querySelector('[data-rc-action="export"]').disabled = !draft.result;
  }
  function open(key, reference) {
    var paper = window.findPaperByKey(key), context = paper && window.ensureRevisionRound(paper, reference);
    if (!context) return;
    window.setPaperField(paper, 'submissionRevisionRounds', context.rounds);
    window.refreshSubmissionStatus();
    var root = rootFor(context.round.id); if (root) { root.open = true; root.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }
  function loadZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (!zipPromise) zipPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script'); script.src = 'vendor/jszip-3.10.1.min.js';
      script.onload = function () { window.JSZip ? resolve(window.JSZip) : reject(new Error('Word 读取组件未加载，请刷新后重试')); };
      script.onerror = function () { reject(new Error('Word 读取组件加载失败，请检查网络')); }; document.head.appendChild(script);
    }).catch(function (error) { zipPromise = null; throw error; });
    return zipPromise;
  }
  function xmlText(entry) {
    return new Promise(function (resolve, reject) {
      var content = '', stream = entry.internalStream('string');
      stream.on('data', function (chunk) {
        content += chunk;
        if (content.length > 12 * 1024 * 1024) { stream.pause(); reject(new Error('Word 正文结构较大，请按章节另存为 TXT 后比较')); }
      }).on('error', reject).on('end', function () { resolve(content); }).resume();
    });
  }
  async function readFile(file) {
    if (!file || file.size > 50 * 1024 * 1024) throw new Error('请选择不超过 50 MB 的 Word、Markdown 或 TXT 文件');
    var extension = (file.name.split('.').pop() || '').toLowerCase();
    if (['docx', 'md', 'markdown', 'txt'].indexOf(extension) < 0) throw new Error('支持 .docx、.md、.markdown 和 .txt 文件');
    var bytes = await file.arrayBuffer();
    if (extension === 'docx') {
      var Zip = await loadZip(), archive;
      try { archive = await Zip.loadAsync(bytes); } catch (_) { throw new Error('Word 文件无法读取，请确认是有效的 .docx 文件'); }
      var entry = archive.file('word/document.xml');
      if (!entry) throw new Error('文件没有 Word 正文，请重新另存为 .docx 后导入');
      return Core.extractDocx(await xmlText(entry), DOMParser);
    }
    var prefix = new Uint8Array(bytes).subarray(0, 2), encoding = 'utf-8', content;
    if (prefix[0] === 255 && prefix[1] === 254) encoding = 'utf-16le';
    if (prefix[0] === 254 && prefix[1] === 255) encoding = 'utf-16be';
    try { content = new TextDecoder(encoding, { fatal: true }).decode(bytes); }
    catch (_) { content = new TextDecoder('gb18030', { fatal: true }).decode(bytes); }
    return Core.validateText(content);
  }
  async function importFile(root, side, file) {
    var roundId = root.dataset.rcRound, draft = state(roundId), ticket = ++draft[side + 'Ticket'];
    setStatus(roundId, '正在读取文件…');
    try {
      var content = await readFile(file);
      if (ticket !== draft[side + 'Ticket']) return;
      draft[side] = { name: file.name.slice(0, 120), text: content }; invalidate(roundId);
      var current = rootFor(roundId);
      if (current) { current.querySelector('[data-rc-name="' + side + '"]').value = draft[side].name; current.querySelector('[data-rc-text="' + side + '"]').value = content; }
      setStatus(roundId, '已读取 ' + file.name + '，可开始对比');
    } catch (error) { if (ticket === draft[side + 'Ticket']) setStatus(roundId, error.message, true); }
  }
  function compare(roundId) {
    var draft = state(roundId), revision = draft.revision; stopWorker(draft);
    draft.result = null; renderResult(roundId); setStatus(roundId, '正在对比…');
    var worker, timeout;
    try { worker = new Worker('revision-compare-worker.js?v=' + release); }
    catch (_) { setStatus(roundId, '比较组件未启动，请检查浏览器设置后重试', true); return; }
    draft.worker = worker;
    function done() { clearTimeout(timeout); worker.terminate(); if (draft.worker === worker) draft.worker = null; }
    timeout = setTimeout(function () { done(); if (draft.revision === revision) setStatus(roundId, '比较耗时较长，请按章节拆分后重试', true); }, 9000);
    worker.onerror = function () { done(); if (draft.revision === revision) setStatus(roundId, '比较组件加载失败，请刷新后重试', true); };
    worker.onmessage = function (event) {
      done(); if (draft.revision !== revision) return;
      if (!event.data.ok) { setStatus(roundId, event.data.error, true); return; }
      draft.result = event.data.result; draft.activeChange = -1; renderResult(roundId);
      setStatus(roundId, event.data.result.rows.every(function (row) { return row.type === 'same'; }) ? '两个版本的提取文字一致' : '对比完成，绿色为新增，红色为删除，黄色为修改，蓝色为移动');
    };
    worker.postMessage({ before: draft.before.text, after: draft.after.text });
  }
  function jump(roundId, direction) {
    var draft = state(roundId), root = rootFor(roundId), rows = Array.from(root.querySelectorAll('[data-rc-change]'));
    if (!rows.length) return;
    draft.activeChange = draft.activeChange < 0 ? (direction > 0 ? 0 : rows.length - 1) : (draft.activeChange + direction + rows.length) % rows.length;
    rows.forEach(function (row, index) { row.classList.toggle('rc-active', index === draft.activeChange); });
    rows[draft.activeChange].scrollIntoView({ block: 'nearest', behavior: 'smooth' }); rows[draft.activeChange].focus({ preventScroll: true });
    root.querySelector('[data-rc-position]').textContent = (draft.activeChange + 1) + ' / ' + rows.length;
  }
  function storage() {
    if (!window.parent || window.parent === window || !window.parent.__academicAttachments) throw new Error('请从学术工作台打开论文管线，并登录后使用云端保存');
    return window.parent.__academicAttachments;
  }
  async function account() {
    storage(); var email = await window.parent.__academicGetCurrentUserEmail();
    if (!email) throw new Error('请先登录工作台后保存或读取对比');
    return email;
  }
  async function save(roundId) {
    var draft = state(roundId); if (draft.saving) return;
    var root = rootFor(roundId), button = root.querySelector('[data-rc-action="save"]');
    draft.saving = true; button.disabled = true; setStatus(roundId, '正在保存到私有云端空间…');
    try {
      Core.validateText(draft.before.text); Core.validateText(draft.after.text);
      if (!draft.before.text && !draft.after.text) throw new Error('请先导入或填写两个版本');
      var owner = await account(), revision = draft.revision;
      if (typeof window.__academicPipelineCloudSave !== 'function') throw new Error('论文保存服务尚未就绪，请稍后重试');
      var persisted = await window.__academicPipelineCloudSave();
      if (!persisted || persisted.scope !== 'cloud') throw new Error('请先登录并确认论文轮次已保存到云端');
      var payload = { type: 'academic-revision-comparison', schemaVersion: 1, roundId: roundId, before: { ...draft.before }, after: { ...draft.after } };
      var bytes = new TextEncoder().encode(JSON.stringify(payload));
      var hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), function (value) { return value.toString(16).padStart(2, '0'); }).join('');
      var name = 'version-compare-' + hash.slice(0, 24) + '.json', contextId = 'revision_compare_' + roundId;
      var existing = await storage().list('paper', contextId);
      if (await account() !== owner) throw new Error('工作台账号已切换，请重新载入');
      if (!existing.length || existing[0].file_name !== name) await storage().upload('paper', contextId, new File([bytes], name, { type: 'application/json' }));
      if (await account() !== owner) throw new Error('工作台账号已切换，请重新载入');
      draft.dirty = draft.revision !== revision;
      setStatus(roundId, draft.dirty ? '已保存本次快照，仍有新修改需要保存' : '两个版本的提取文字已保存到本轮私有附件');
    } catch (error) { setStatus(roundId, error.message || '保存失败，请重试', true); }
    finally { draft.saving = false; var current = rootFor(roundId); if (current) current.querySelector('[data-rc-action="save"]').disabled = false; }
  }
  async function load(roundId) {
    var draft = state(roundId);
    if (draft.dirty && !window.confirm('读取最近保存将替换当前两个版本的文字，是否继续？')) return;
    var revision = draft.revision; setStatus(roundId, '正在读取本轮最近保存的对比…');
    try {
      var owner = await account(), files = await storage().list('paper', 'revision_compare_' + roundId);
      var file = files.find(function (item) { return /^version-compare-[a-f0-9]{24}\.json$/.test(item.file_name); });
      if (!file) throw new Error('本轮还没有保存的对比');
      if (file.file_size > 8 * 1024 * 1024) throw new Error('保存文件过大，无法载入');
      if (await account() !== owner) throw new Error('工作台账号已切换，请重新载入');
      var downloaded = await storage().download(file.id), value = JSON.parse(await downloaded.blob.text());
      if (await account() !== owner) throw new Error('工作台账号已切换，请重新载入');
      if (draft.revision !== revision) throw new Error('读取期间内容已有修改，请保存后重试');
      if (value.type !== 'academic-revision-comparison' || value.schemaVersion !== 1 || value.roundId !== roundId || !value.before || !value.after) throw new Error('保存文件的论文轮次或格式不匹配');
      ['before', 'after'].forEach(function (side) { Core.validateText(value[side].text); });
      stopWorker(draft); draft.revision++; draft.beforeTicket++; draft.afterTicket++; draft.result = null;
      ['before', 'after'].forEach(function (side) { draft[side] = { name: String(value[side].name || (side === 'before' ? '原始版本' : '修改版本')).slice(0, 120), text: value[side].text }; });
      draft.dirty = false; var root = rootFor(roundId);
      if (root) ['before', 'after'].forEach(function (side) { root.querySelector('[data-rc-name="' + side + '"]').value = draft[side].name; root.querySelector('[data-rc-text="' + side + '"]').value = draft[side].text; });
      compare(roundId);
    } catch (error) { setStatus(roundId, error.message || '读取失败，请重试', true); }
  }
  function exportReport(roundId) {
    var draft = state(roundId); if (!draft.result) return;
    var root = rootFor(roundId), paper = window.findPaperByKey(root.dataset.rcPaper), context = paper && window.submissionRevisionContext(paper, roundId);
    var title = paper ? window.getPaperField(paper, 'title') || '论文' : '论文';
    var report = Core.report(draft.result, { title: title, roundLabel: '第 ' + (context?.round.number || '—') + ' 次投稿',
      time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }), beforeName: draft.before.name, afterName: draft.after.name });
    var url = URL.createObjectURL(new Blob([report], { type: 'text/html;charset=utf-8' })), link = document.createElement('a');
    link.href = url; link.download = '论文版本对比.html'; document.body.appendChild(link); link.click(); link.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  document.addEventListener('input', function (event) {
    var root = event.target.closest('[data-rc-round]'); if (!root) return;
    var draft = state(root.dataset.rcRound), side = event.target.dataset.rcText;
    if (side) { draft[side + 'Ticket']++; draft[side].text = event.target.value; invalidate(root.dataset.rcRound); }
    side = event.target.dataset.rcName;
    if (side) { draft[side].name = event.target.value; draft.revision++; draft.dirty = true; renderResult(root.dataset.rcRound); setStatus(root.dataset.rcRound, '版本名称已修改，点击保存可保留'); }
  });
  document.addEventListener('change', function (event) {
    var root = event.target.closest('[data-rc-round]'); if (!root) return;
    if (event.target.dataset.rcFile && event.target.files[0]) { var file = event.target.files[0]; event.target.value = ''; importFile(root, event.target.dataset.rcFile, file); }
    if (event.target.hasAttribute('data-rc-only')) { state(root.dataset.rcRound).onlyChanges = event.target.checked; root.querySelector('.rc-results').classList.toggle('rc-changes-only', event.target.checked); }
  });
  document.addEventListener('click', function (event) {
    var button = event.target.closest('[data-rc-action]'), root = button && button.closest('[data-rc-round]');
    if (!root) return;
    var id = root.dataset.rcRound, action = button.dataset.rcAction;
    if (action === 'compare') compare(id);
    if (action === 'save') save(id);
    if (action === 'load') load(id);
    if (action === 'export') exportReport(id);
    if (action === 'previous' || action === 'next') jump(id, action === 'next' ? 1 : -1);
  });
  window.addEventListener('beforeunload', function (event) {
    if (Array.from(drafts.values()).some(function (draft) { return draft.dirty; })) { event.preventDefault(); event.returnValue = ''; }
  });
  window.RevisionComparison = { render: render, open: open, readFile: readFile };
})();
