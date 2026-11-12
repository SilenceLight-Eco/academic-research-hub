const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { TextDecoder, TextEncoder } = require('node:util');
const { parseHTML, DOMParser } = require(process.argv[2] ? path.join(process.argv[2], 'linkedom') : 'linkedom');
const JSZip = require('../web/vendor/jszip-3.10.1.min.js');
const Core = require('../web/revision-compare-core.js');
const uiSource = fs.readFileSync(path.join(__dirname, '../web/revision-compare.js'), 'utf8');
const roundId = 'rcomparison123';
async function settle() { for (let i = 0; i < 4; i++) await new Promise(resolve => setTimeout(resolve, 5)); }
function harness(options = {}) {
  const { document } = parseHTML('<html><body><main id="host"></main></body></html>');
  document.defaultView.HTMLElement.prototype.scrollIntoView = function () {};
  const listeners = {}, workers = [], uploads = [], stored = [], calls = [];
  let currentEmail = 'owner@example.test';
  class Worker {
    constructor() { workers.push(this); }
    postMessage(payload) { this.payload = payload; if (!options.holdWorker) queueMicrotask(() => this.onmessage({ data: { ok: true, result: Core.compare(payload.before, payload.after) } })); }
    terminate() { this.terminated = true; }
  }
  const bridge = {
    async list(kind, id) { calls.push({ action: 'list', kind, id }); return stored.slice().reverse(); },
    async upload(kind, id, file) {
      calls.push({ action: 'upload', kind, id });
      if (options.uploadFails) throw new Error('上传失败');
      uploads.push({ kind, id, text: await file.text() });
      const item = { id: 'file' + uploads.length, file_name: file.name, file_size: file.size, blob: file };
      stored.push(item); return item;
    },
    async download(id) { return { blob: stored.find(item => item.id === id).blob }; }
  };
  const window = { RevisionCompareCore: Core, JSZip, addEventListener: (name, handler) => { listeners[name] = handler; }, confirm: () => true,
    __academicPipelineCloudSave: async () => { calls.push({ action: 'save-round' }); return { scope: options.localSave ? 'local' : 'cloud' }; },
    parent: { __academicAttachments: bridge, __academicGetCurrentUserEmail: async () => currentEmail }
  };
  vm.runInNewContext(uiSource, { window, document, Worker, DOMParser, TextDecoder, TextEncoder, Uint8Array, File, Blob, URL,
    crypto: globalThis.crypto, setTimeout, clearTimeout, console, Map, Date });
  document.getElementById('host').innerHTML = window.RevisionComparison.render('paper1', null, { id: roundId });
  const root = () => document.querySelector('[data-rc-round]');
  function input(side, value) {
    const field = root().querySelector('[data-rc-text="' + side + '"]'); field.value = value;
    field.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
  }
  return { window, document, root, input, listeners, workers, uploads, stored, calls,
    click(action) { root().querySelector('[data-rc-action="' + action + '"]').click(); },
    status: () => root().querySelector('[data-rc-status]').textContent,
    account: value => { currentEmail = value; }
  };
}

test('Chinese and English replacements highlight changed tokens and preserve exact text', () => {
  for (const [before, after, added] of [
    ['政策显著提高了企业创新水平。', '政策显著提高了企业绿色创新水平。', '绿色'],
    ['Policy improves innovation.', 'Policy improves green innovation.', 'green ']
  ]) {
    const result = Core.compare(before, after), row = result.rows[0];
    assert.equal(result.stats.changed, 1); assert.equal(row.before, before); assert.equal(row.after, after);
    assert.equal(row.beforeParts.map(part => part.text).join(''), before); assert.equal(row.afterParts.map(part => part.text).join(''), after);
    assert.ok(row.afterParts.some(part => part.type === 'added' && part.text.includes(added)));
  }
});

test('empty sides, blank paragraphs, trailing newlines and meaningful whitespace are preserved', () => {
  assert.equal(Core.compare('', '新段落').stats.added, 1);
  assert.equal(Core.compare('旧段落', '').stats.removed, 1);
  const result = Core.compare('A\n\nB\n', 'A\n\nB\n');
  assert.equal(result.rows.length, 4); assert.ok(result.rows.every(row => row.type === 'same'));
  assert.equal(Core.compare('a b', 'a  b').stats.changed, 1);
  assert.throws(() => Core.compare('', ''), /导入或粘贴/);
  assert.throws(() => Core.validateText('x'.repeat(1000001)), /100 万/);
});

test('exact unique paragraphs can be identified as moved, while repeated paragraphs remain conservative', () => {
  const result = Core.compare('one\nmove here\nthree\nfour', 'one\nthree\nfour\nmove here');
  assert.equal(result.stats.moved, 1); assert.equal(result.rows.filter(row => row.type.startsWith('moved-')).length, 2);
  const repeated = Core.compare('repeat\na\nrepeat\nb\nc', 'repeat\na\nb\nc\nrepeat');
  assert.equal(repeated.stats.moved, 0);
});

test('Word extraction handles split runs, tables, tabs and visible tracked changes', () => {
  const xml = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    '<w:p><w:r><w:t>政策</w:t><w:t>影响</w:t><w:tab/><w:t>分析</w:t></w:r><w:del><w:r><w:delText>旧文字</w:delText></w:r></w:del><w:ins><w:r><w:t>新文字</w:t></w:r></w:ins></w:p>' +
    '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>变量</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>系数</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
    '<w:p/><w:p><w:r><w:t>结论</w:t><w:br/><w:t>第二行</w:t></w:r></w:p></w:body></w:document>';
  assert.equal(Core.extractDocx(xml, DOMParser), '政策影响\t分析新文字\n变量\t系数\n\n结论\n第二行');
  assert.throws(() => Core.extractDocx('<root/>', DOMParser), /Word 正文/);
});

test('import reads actual DOCX archives and preserves Markdown, UTF-16 and GB18030 text', async () => {
  const h = harness();
  const zip = new JSZip(); zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>论文正文</w:t></w:r></w:p></w:body></w:document>');
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  assert.equal(await h.window.RevisionComparison.readFile(new File([bytes], '论文.docx')), '论文正文');
  assert.equal(await h.window.RevisionComparison.readFile(new File(['# 标题\n\n正文\n'], '论文.md')), '# 标题\n\n正文\n');
  assert.equal(await h.window.RevisionComparison.readFile(new File([Buffer.concat([Buffer.from([255, 254]), Buffer.from('中文', 'utf16le')])], '论文.txt')), '中文');
  assert.equal(await h.window.RevisionComparison.readFile(new File([Buffer.from([0xd6, 0xd0, 0xce, 0xc4])], '论文.txt')), '中文');
  await assert.rejects(h.window.RevisionComparison.readFile(new File(['bad'], '论文.docx')), /无法读取/);
  await assert.rejects(h.window.RevisionComparison.readFile(new File(['bad'], '论文.pdf')), /支持/);
});

test('UI performs comparisons in a worker and shows explicit failure/stale states', async () => {
  const h = harness(); h.input('before', '研究结论'); h.input('after', '新的研究结论'); h.click('compare'); await settle();
  assert.equal(h.workers.length, 1); assert.match(h.root().querySelector('[data-rc-output]').textContent, /修改 1/);
  assert.equal(h.root().querySelector('[data-rc-action="export"]').disabled, false);
  h.input('after', '又一次修改'); assert.equal(h.root().querySelector('[data-rc-output]').textContent, '');
  assert.equal(h.root().querySelector('[data-rc-action="export"]').disabled, true);
  const pending = harness({ holdWorker: true }); pending.input('before', 'A'); pending.input('after', 'B'); pending.click('compare'); pending.input('after', 'C');
  pending.workers[0].onmessage({ data: { ok: true, result: Core.compare('A', 'B') } });
  assert.equal(pending.root().querySelector('[data-rc-output]').textContent, ''); assert.ok(pending.workers[0].terminated);
});

test('cloud snapshots are scoped to the stable round and avoid duplicate copies', async () => {
  const h = harness(); h.input('before', '原稿'); h.input('after', '返修稿'); h.click('save'); await settle();
  assert.equal(h.uploads.length, 1); assert.equal(h.uploads[0].id, 'revision_compare_' + roundId);
  assert.equal(h.calls[0].action, 'save-round'); assert.match(h.status(), /已保存/);
  h.click('save'); await settle(); assert.equal(h.uploads.length, 1);
  h.input('before', '临时修改'); h.click('load'); await settle();
  assert.equal(h.root().querySelector('[data-rc-text="before"]').value, '原稿'); assert.match(h.status(), /对比完成/);
  const payload = JSON.parse(h.uploads[0].text); assert.equal(payload.roundId, roundId); assert.equal(payload.schemaVersion, 1);
});

test('failed cloud saves remain dirty and local-only saves cannot claim cloud persistence', async () => {
  for (const options of [{ uploadFails: true }, { localSave: true }]) {
    const h = harness(options); h.input('before', '原稿'); h.input('after', '返修稿'); h.click('save'); await settle();
    assert.ok(h.root().querySelector('[data-rc-status]').classList.contains('is-error'));
    let warned = false; h.listeners.beforeunload({ preventDefault() { warned = true; } }); assert.ok(warned);
    assert.equal(h.uploads.length, 0);
  }
});

test('comparison drafts and results survive status redraws, with correct first previous-change navigation', async () => {
  const h = harness(); h.input('before', 'alpha\nunchanged\nbeta'); h.input('after', 'alpha changed\nunchanged\nbeta changed'); h.click('compare'); await settle();
  h.document.getElementById('host').innerHTML = h.window.RevisionComparison.render('paper1', null, { id: roundId });
  assert.equal(h.root().querySelector('[data-rc-text="after"]').value, 'alpha changed\nunchanged\nbeta changed');
  assert.match(h.root().querySelector('[data-rc-output]').textContent, /修改 2/);
  h.click('previous'); assert.equal(h.root().querySelector('[data-rc-position]').textContent, '2 / 2');
});

test('wrong-round snapshots fail before replacing the current manuscript text', async () => {
  const h = harness(); h.input('before', '原稿'); h.input('after', '返修稿'); h.click('save'); await settle();
  const payload = JSON.parse(h.uploads[0].text); payload.roundId = 'rotherround123';
  h.stored[0].blob = new Blob([JSON.stringify(payload)]);
  h.input('before', '当前内容'); h.click('load'); await settle();
  assert.equal(h.root().querySelector('[data-rc-text="before"]').value, '当前内容'); assert.match(h.status(), /轮次或格式不匹配/);
});

test('exported HTML escapes document names, paper titles and manuscript content', () => {
  const result = Core.compare('hello', '<script>alert(1)</script>');
  const report = Core.report(result, { title: '<img onerror="bad()">', roundLabel: '第一轮', time: 'today', beforeName: 'old', afterName: '<svg onload=bad()>' });
  assert.doesNotMatch(report, /<script>|<img |<svg /); assert.match(report, /&lt;script&gt;/); assert.match(report, /default-src/);
  assert.match(report, /新增|修改/);
});

test('pipeline integrates the comparison inside revision rounds and preserves it in existing archives', () => {
  const html = fs.readFileSync(path.join(__dirname, '../web/paper-pipeline-v2.html'), 'utf8');
  assert.match(html, /RevisionComparison\.render\(pkey\(p\), reference, round\)/);
  assert.match(html, /rounds\.map\(round => renderSubmissionRevision\(p, round\.id\)\)/);
  assert.match(html, /comparisonPanels\.get\(el\.dataset\.rcRound\)/);
  assert.doesNotMatch(html, /data-page="comparison"/);
});
