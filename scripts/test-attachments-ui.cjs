const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../web/attachments.js'), 'utf8');
const page = fs.readFileSync(path.join(__dirname, '../web/workbench.html'), 'utf8');
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness(api = {}) {
  const nodes = new Map(), handlers = {}, frames = { contentWindow: {} }, uploads = [], downloaded = [], removed = [], alerts = [];
  function element(tag) { return { tag, hidden: true, value: '', textContent: '', dataset: {}, children: [], disabled: false, handlers: {}, classList: { toggle() {} },
    replaceChildren() { this.children = []; }, appendChild(child) { this.children.push(child); }, append(...children) { this.children.push(...children); },
    addEventListener(type, handler) { this.handlers[type] = handler; }, click() {}, remove() {} }; }
  const node = id => { if (!nodes.has(id)) nodes.set(id, element(id)); return nodes.get(id); };
  const document = { getElementById: node, querySelector: () => frames, createElement: element, body: element('body'), addEventListener(type, handler) { handlers['document:' + type] = handler; } };
  const window = { __academicAttachments: {
    list: api.list || (async () => []),
    upload: api.upload || (async (kind, id, file) => uploads.push({ kind, id, name: file.name })),
    download: async id => { downloaded.push(id); return { name: 'test.docx', blob: {} }; },
    remove: async id => removed.push(id)
  }, alert: text => alerts.push(text), confirm: () => true, addEventListener(type, handler) { handlers['window:' + type] = handler; } };
  vm.runInNewContext(source, { window, document, location: { origin: 'https://example.test' }, Date, Array, URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} }, setTimeout() {} });
  function open(id, title = id, description = '', options = {}) { handlers['window:message']({ origin: options.origin || 'https://example.test', source: options.source || frames.contentWindow, data: { type: 'academic-research-hub-open-attachments', id, title, description } }); }
  const action = (id, type) => node('fileList').handlers.click({ target: { closest: () => ({ dataset: { fileId: id, fileAction: type } }) } });
  async function upload(file = { name: 'test.docx', size: 100 }) { node('fileInput').files = [file]; await node('fileInput').handlers.change(); }
  return { node, open, action, upload, uploads, downloaded, removed, alerts };
}

test('modal labels identify the selected round/type and reset when opening generic attachments', async () => {
  const h = harness(); h.open('submission_r123456789_response', '论文 · 第 2 次投稿 · 回复信', 'Journal C · 本处仅显示回复信'); await tick();
  assert.match(h.node('fileModalTitle').textContent, /第 2 次投稿 · 回复信/);
  assert.equal(h.node('fileContextDescription').hidden, false);
  assert.equal(h.node('fileModal').hidden, false);
  h.open('legacy-files', '通用附件'); await tick();
  assert.equal(h.node('fileContextDescription').hidden, true); assert.equal(h.node('fileContextDescription').textContent, '');
  assert.ok(page.includes('id="fileContextDescription"'));
});

test('late responses from the previous round do not replace the current list or action targets', async () => {
  const old = deferred(), fresh = deferred(); const h = harness({ list: (_kind, id) => id === 'old' ? old.promise : fresh.promise });
  h.open('old'); h.open('fresh');
  fresh.resolve([{ id: 'new-file', file_name: 'New.docx', file_size: 200, created_at: '2026-10-15' }]); await tick();
  old.resolve([{ id: 'old-file', file_name: 'Old.docx', file_size: 100, created_at: '2026-10-14' }]); await tick();
  assert.equal(h.node('fileList').children[0].children[0].children[0].textContent, 'New.docx');
  await h.action('new-file', 'download'); assert.deepEqual(h.downloaded, ['new-file']);
  await h.action('old-file', 'remove'); assert.equal(h.removed.length, 0);
});

test('uploads use the exact selected private context; switching while uploading is blocked', async () => {
  const pending = deferred(), calls = []; const h = harness({ upload: (kind, id, file) => { calls.push({ kind, id, name: file.name }); return pending.promise; } });
  h.open('round-one-response', '回复信'); await tick(); const uploading = h.upload();
  h.open('round-two-manuscript', '投稿稿');
  assert.match(h.node('fileModalTitle').textContent, /回复信/);
  assert.equal(h.node('fileUpload').disabled, true);
  pending.resolve(); await uploading;
  assert.deepEqual(calls, [{ kind: 'paper', id: 'round-one-response', name: 'test.docx' }]);
  assert.equal(h.node('fileUpload').disabled, false);
  h.open('round-two-manuscript', '投稿稿'); await tick();
  assert.match(h.node('fileModalTitle').textContent, /投稿稿/);
});

test('untrusted frames and origins cannot open a file context', async () => {
  const h = harness();
  h.open('bad', 'Bad', '', { origin: 'https://evil.test' });
  h.open('bad', 'Bad', '', { source: {} }); await tick();
  assert.equal(h.node('fileModal').hidden, true); assert.equal(h.node('fileModalTitle').textContent, '');
});

test('closing before a read finishes leaves no stale files in the next modal', async () => {
  const old = deferred(); const h = harness({ list: (_kind, id) => id === 'old' ? old.promise : Promise.resolve([]) });
  h.open('old'); h.node('fileModalClose').handlers.click(); h.open('fresh'); await tick();
  old.resolve([{ id: 'old-file', file_name: 'Old.docx' }]); await tick();
  assert.match(h.node('fileList').children[0].textContent, /还没有附件/);
  await h.action('old-file', 'download'); assert.equal(h.downloaded.length, 0);
});
