const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const toolsSource = fs.readFileSync(path.join(__dirname, '../web/research-tools.js'), 'utf8');
const appSource = fs.readFileSync(path.join(__dirname, '../web/app.js'), 'utf8');
const context = vm.createContext({ window: {} }); vm.runInContext(toolsSource, context);
const tools = context.window.__academicResearchTools;
const staticApiSource = fs.readFileSync(path.join(__dirname, '../web/static-api.js'), 'utf8');
const harnessSource = fs.readFileSync(path.join(__dirname, 'test-reference-operations.cjs'), 'utf8');
const apiContext = vm.createContext({ staticApiSource, vm, structuredClone, Response, Request, Headers, URL, setTimeout, clearTimeout, Date, Math, JSON, Object, Array, String, Number, Boolean, Map, Set, Promise, Error, RegExp, console });
vm.runInContext(harnessSource.slice(harnessSource.indexOf('function createApiHarness('), harnessSource.indexOf('\ntest(')), apiContext);
const apiHarness = (payload, options = {}) => apiContext.createApiHarness(payload, { researchTools: tools, ...options });
const row = { id: 'check-1', label: '表1', original: '0.123', reproduced: '0.124', difference: '0.001', explanation: '样本口径差异', status: '存在差异' };
test('replication checks persist across reload, partial saves and trash restoration, and failed saves preserve old data', async () => {
  const h = apiHarness({ replications: { items: [{ id: 'rp-1', title: '旧复现任务', status: '复现中' }], trash: [] } });
  const request = body => h.request(body, '/api/replications');
  assert.equal((await request({ action: 'save', id: 'rp-1', checks: [row] })).status, 200);
  await request({ action: 'save', id: 'rp-1', notes: '补充笔记' });
  const reloaded = apiHarness(h.readWorkspace());
  assert.equal((await (await reloaded.get('/api/replications')).json()).replications.items[0].checks[0].difference, '0.001');
  for (const checks of [[row, row], [{ ...row, status: 'bad' }], [{ ...row, original: [] }]]) {
    const before = h.readWorkspace(); assert.equal((await request({ action: 'save', id: 'rp-1', checks })).status, 422); assert.deepEqual(h.readWorkspace(), before);
  }
  await request({ action: 'trash', id: 'rp-1' });
  await request({ action: 'restore', id: h.readWorkspace().replications.trash[0].id });
  assert.equal(h.readWorkspace().replications.items[0].checks[0].label, '表1');
  const offline = apiHarness(h.readWorkspace(), { failWrites: true });
  assert.ok((await offline.request({ action: 'save', id: 'rp-1', checks: [] }, '/api/replications')).status >= 400);
  assert.equal(offline.readWorkspace().replications.items[0].checks.length, 1);
});
test('Markdown batch imports preserve whitespace, disambiguate names and can be retried without duplicate documents', async () => {
  const original = '# 原样\r\n\r\n段落一\n\n\n最后空行\n\n';
  const h = apiHarness({ knowledgeBase: { folders: [{ id: 1, title: '读书笔记' }], docs: [{ id: 5, title: '论文', content: 'keep', folderId: '1' }], trash: [] } });
  const body = { action: 'import-docs', batchId: '12345678-1234-4234-8234-123456789abc', folderId: '1', documents: [{ title: '论文', content: original }, { title: '论文', content: '' }] };
  for (let i = 0; i < 2; i++) assert.equal((await h.request(body, '/api/knowledge-base')).status, 200);
  const docs = h.readWorkspace().knowledgeBase.docs;
  assert.equal(docs.length, 3); assert.equal(docs[0].content, 'keep'); assert.equal(docs[1].content, original);
  assert.deepEqual(docs.map(doc => doc.title), ['论文', '论文 (2)', '论文 (3)']);
  assert.ok(docs.every(doc => Number.isSafeInteger(doc.id)));
});
test('invalid import batches, missing folders, deleted batches and cloud failures never partially import content', async () => {
  const payload = { knowledgeBase: { folders: [], docs: [], trash: [] } };
  const h = apiHarness(payload), body = { action: 'import-docs', batchId: '12345678-1234-4234-8234-123456789abc', folderId: '', documents: [{ title: 'one', content: 'one' }] };
  for (const patch of [{ folderId: 'gone' }, { documents: [{ title: 'valid', content: 'one' }, { title: '', content: 'bad' }] }, { batchId: '../bad' }]) {
    assert.ok((await h.request({ ...body, ...patch }, '/api/knowledge-base')).status >= 400); assert.deepEqual(h.readWorkspace(), payload);
  }
  const offline = apiHarness(payload, { failWrites: true });
  assert.ok((await offline.request(body, '/api/knowledge-base')).status >= 400); assert.deepEqual(offline.readWorkspace(), payload);
  await h.request(body, '/api/knowledge-base');
  const id = h.readWorkspace().knowledgeBase.docs[0].id;
  await h.request({ action: 'trash-doc', id }, '/api/knowledge-base');
  assert.equal((await h.request(body, '/api/knowledge-base')).status, 409);
  assert.equal(h.readWorkspace().knowledgeBase.docs.length, 0);
  const guest = apiHarness(payload, { signedOut: true }); assert.equal((await guest.request(body, '/api/knowledge-base')).status, 401);
});
test('ZIP export paths are safe, unique across duplicate folders and filenames, and preserve Markdown content', () => {
  const kb = { folders: [{ id: 1, title: '..' }, { id: 2, title: '未分类' }, { id: 3, title: '文件夹' }], docs: [
    { title: '../one', content: '\n\n' }, { title: '../one', content: 'two' },
    { title: 'CON', folderId: 1, content: 'three' }, { title: 'a/b', folderId: 2, content: 'four' }, { title: 'a/b', folderId: 3, content: 'five' }
  ] };
  const entries = tools.markdownPaths(kb, 'all'), paths = Array.from(entries, entry => entry.path);
  assert.equal(new Set(paths.map(value => value.toLowerCase())).size, 5);
  assert.ok(paths.every(value => !value.split('/').includes('..') && !value.includes('\\')));
  assert.equal(entries[0].content, '\n\n'); assert.equal(tools.markdownPaths(kb, '2').length, 1);
});
test('reports include every check result and legacy replication tasks export without checks', () => {
  const report = tools.replicationReport({ title: '复现', citation: '引用', checks: [row] });
  for (const value of ['引用', '表1', '0.123', '0.124', '0.001', '样本口径差异', '存在差异']) assert.ok(report.includes(value));
  assert.ok(tools.replicationReport({ title: '旧任务' }).includes('尚未添加核对项'));
});
test('CV combines real publications and records, uses stated years, avoids duplicate papers and escapes printable HTML', () => {
  const payload = { publications: [{ title: '同一篇论文', date: '2023-02-01' }], researchHub: {
    'research-hub-cards-v1': JSON.stringify({ published: { added: { one: { title: '同一篇论文', year: '2025', doi: '10.1234/one' } } } }),
    'research-hub-fields-v1': JSON.stringify({ one: { year: '2026', authors: '作者' } })
  }, academicRecords: { funding: [{ title: '<script>alert(1)</script>', meta: '项目编号20269999', date: '2026-11-24' }], conferences: [{ title: '会议', details: { time: '2024-05-06', paper: '报告论文' } }] } };
  const items = tools.cvItems(payload);
  assert.equal(items.filter(item => item.kind === 'publications').length, 1);
  assert.deepEqual(Array.from(items, item => item.year), ['2026', '2024', '']);
  const selected = items.filter(item => item.kind !== 'publications');
  const markdown = tools.cvMarkdown(selected, { name: '姓名', affiliation: '单位' });
  assert.ok(!markdown.includes('同一篇论文')); assert.ok(markdown.includes('未注明年份')); assert.ok(markdown.includes('报告论文'));
  const html = tools.printableHtml(markdown).document;
  assert.ok(!html.includes('<script>alert')); assert.ok(html.includes('&lt;script&gt;')); assert.ok(html.includes('size:A4'));
});

function transferHarness(options = {}) {
  const nodes = new Map(), downloads = [], calls = [], toasts = [], slots = {};
  const state = { panel: 'knowledge-base', kbFolderId: 'all', kbDocId: 5, knowledgeBase: { folders: [{ id: 1, title: '目标目录' }], docs: [{ id: 5, title: '原文', content: 'old\n\n' }] } };
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value: id === 'academicCvYear' ? 'all' : '', hidden: false, dataset: {}, handlers: {}, innerHTML: '', textContent: '', addEventListener(type, handler) { this.handlers[type] = handler; }, click() { return this.handlers.click && this.handlers.click(); } });
    return nodes.get(id);
  };
  let inputs = [], rows = [];
  const ctx = vm.createContext({ account: { id: 'owner' }, state, autoSaveSlots: slots, window: { __academicResearchTools: tools }, Blob,
    crypto: { randomUUID: () => '12345678-1234-4234-8234-123456789abc' },
    $: selector => node(selector.slice(1)), $$: selector => selector.endsWith('[data-cv-year]') ? rows : inputs.filter(input => selector.includes(':checked') ? input.checked : input.dataset.cvKind === (selector.match(/data-cv-kind="(.*?)"/) || [])[1]),
    escapeAttribute: value => String(value).replace(/"/g, '&quot;'), escapeHtml: value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;'),
    toast: text => toasts.push(text), downloadBlob: (blob, name) => downloads.push({ blob, name }),
    editorAutoSaveKey: () => 'knowledge:' + state.kbDocId,
    flushAutoSaveKey: async key => { if (options.flush) await options.flush(key, state); },
    flushAllAutoSaves: async () => {}, apiWriteChain: Promise.resolve(), hasUnsavedChanges: () => false,
    readKnowledgeDraft: () => ({ title: '最新草稿', content: '尚未保存\n\n' }), renderKnowledgeBase: () => {},
    api: async (endpoint, init) => { const body = init && JSON.parse(init.body); calls.push({ endpoint, body }); return options.api ? options.api(endpoint, body, state) : { ok: true, data: {} }; },
    loadBackupZip: async () => class { file() {} async generateAsync() { if (options.zipWait) await options.zipWait(); return new Blob(['zip']); } }
  });
  const start = appSource.indexOf('  // ===== Markdown 文件交换与学术简历 =====');
  vm.runInContext(appSource.slice(start, appSource.indexOf('  // ===== 知识库：', start)), ctx);
  ctx.bindResearchTransferEvents();
  return { ctx, state, node, downloads, calls, toasts, slots, setSelection(values) { inputs = values; rows = values.map(input => ({ dataset: { cvYear: input.year }, hidden: false })); return rows; } };
}

test('file-picker import captures folder and retries the same batch after failure, without replacing newer edits', async () => {
  let attempt = 0;
  const h = transferHarness({ api: async (_endpoint, body) => {
    if (!attempt++) return { ok: false, error: '暂时离线' };
    h.slots['knowledge:5'] = { dirty: true };
    return { ok: true, knowledgeBase: { folders: [{ id: 1, title: '目录' }], docs: [{ id: 22, title: '论文', content: body.documents[0].content, folderId: '1' }] }, importedIds: [22] };
  } });
  h.node('kbImportFolder').value = '1';
  const content = '# 标题\n\n\n段落\n\n';
  await h.ctx.prepareKnowledgeImport([{ name: '论文.md', size: 30, text: async () => content }]);
  assert.equal(h.node('kbRetryImport').hidden, false);
  h.node('kbImportFolder').value = '';
  await h.node('kbRetryImport').click();
  assert.deepEqual(h.calls[0].body, h.calls[1].body); assert.equal(h.calls[1].body.folderId, '1');
  assert.equal(h.calls[1].body.documents[0].content, content);
  assert.equal(h.state.kbDocId, 5); assert.equal(h.state.kbDraft.content, '尚未保存\n\n');
  assert.equal(h.node('kbRetryImport').hidden, true);
});

test('import rejects unsupported files and account switches during reading; raw Markdown export flushes the draft first', async () => {
  const h = transferHarness({ flush: async (_key, state) => { state.knowledgeBase.docs[0].content = '新内容\n\n\n'; } });
  await h.ctx.prepareKnowledgeImport([{ name: 'not.pdf', size: 2 }]); assert.equal(h.calls.length, 0);
  await h.node('kbExportMarkdown').click();
  // The UI handler starts an async export; wait for its pending microtasks.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await h.downloads[0].blob.text(), '新内容\n\n\n');
  await h.ctx.prepareKnowledgeImport([{ name: 'private.md', size: 2, text: async () => { h.ctx.account = { id: 'another' }; return 'private'; } }]);
  assert.equal(h.calls.length, 0);
});

test('CV normal controls filter year and individual records, disable empty exports, and ignore stale account responses', async () => {
  const h = transferHarness({ api: async () => ({ ok: true, data: { academicRecords: { funding: [{ title: '基金A', details: { year: '2026' } }], conferences: [{ title: '会议B', details: { time: '2025-10-02' } }] } } }) });
  await h.node('academicCvOpen').click();
  const selections = [
    { dataset: { cvItem: 'funding-0', cvKind: 'funding' }, checked: true, year: '2026' },
    { dataset: { cvItem: 'conferences-0', cvKind: 'conferences' }, checked: true, year: '2025' }
  ];
  const rows = h.setSelection(selections);
  h.node('academicCvYear').value = '2026'; h.node('academicCvPanel').handlers.input();
  assert.equal(rows[1].hidden, true); assert.ok(h.node('academicCvPreview').innerHTML.includes('基金A')); assert.ok(!h.node('academicCvPreview').innerHTML.includes('会议B'));
  h.node('academicCvHtml').click(); assert.ok((await h.downloads[0].blob.text()).includes('基金A'));
  h.node('academicCvPanel').handlers.change({ target: { closest: () => ({ dataset: { cvGroup: 'funding' }, checked: false }) } });
  assert.equal(h.node('academicCvMarkdown').disabled, true); assert.equal(selections[0].checked, false);
  h.ctx.account = { id: 'other' }; h.node('academicCvHtml').click(); assert.equal(h.downloads.length, 1);
  let finish;
  const stale = transferHarness({ api: () => new Promise(resolve => { finish = resolve; }) });
  const opening = stale.node('academicCvOpen').click(); await new Promise(resolve => setImmediate(resolve));
  stale.ctx.account = { id: 'other' }; finish({ ok: true, data: { academicRecords: { funding: [{ title: 'private' }] } } }); await opening;
  assert.equal(stale.node('academicCvSelection').innerHTML, ''); assert.equal(stale.node('academicCvHtml').disabled, true);
});
