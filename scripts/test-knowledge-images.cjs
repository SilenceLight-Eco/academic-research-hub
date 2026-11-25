const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../web/knowledge-images.js'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '../web/app.js'), 'utf8');
const id = '12345678-1234-4234-8234-123456789abc';
const png = () => new File([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvKkAAAAASUVORK5CYII=', 'base64')], '截图.png', { type: 'image/png' });
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness(options = {}) {
  const roots = [], calls = [], reports = [], revoked = [], urls = [];
  const match = (node, selector) => selector === 'img' ? node.tagName === 'IMG' : selector.startsWith('[data-') && node.hasAttribute(selector.slice(1, -1));
  class Element {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.childNodes = []; this.dataset = {}; this.attributes = {}; this.events = {}; this.hidden = false; this.classList = { add() {}, remove() {} }; }
    get children() { return this.childNodes; }
    get firstElementChild() { return this.children[0]; }
    get isConnected() { return roots.includes(this) || Boolean(this.parentElement && this.parentElement.isConnected); }
    setAttribute(name, value) { this.attributes[name] = String(value); if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_m, c) => c.toUpperCase())] = String(value); }
    getAttribute(name) { return this.attributes[name] ?? null; }
    hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
    removeAttribute(name) { delete this.attributes[name]; }
    append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
    appendChild(node) { node.remove(); node.parentElement = this; this.childNodes.push(node); return node; }
    remove() { if (this.parentElement) this.parentElement.childNodes = this.parentElement.childNodes.filter(node => node !== this); this.parentElement = null; }
    replaceWith(node) { const parent = this.parentElement, at = parent.childNodes.indexOf(this); node.parentElement = parent; parent.childNodes[at] = node; this.parentElement = null; }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    addEventListener(type, callback) { this.events[type] = callback; }
    querySelectorAll(selector) { return this.children.flatMap(child => (match(child, selector) ? [child] : []).concat(child.querySelectorAll(selector))); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    set innerHTML(html) {
      this.childNodes = [];
      const found = html.match(/data-kb-image-id="([^"]+)"/); if (!found) return;
      const wrapper = new Element('span'), image = new Element('img'), button = new Element('button');
      wrapper.setAttribute('data-kb-image-id', found[1]);
      image.setAttribute('alt', (html.match(/alt="([^"]*)"/) || [,''])[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
      button.setAttribute('data-kb-image-retry', ''); wrapper.append(image, button); this.appendChild(wrapper);
    }
  }
  const editor = new Element('div'), toolbar = new Element('div'); roots.push(editor, toolbar);
  const range = { commonAncestorContainer: editor, cloneRange() { return { ...this }; }, collapse() {}, selectNodeContents() {}, insertNode(node) { editor.appendChild(node); }, setStartAfter() {} };
  const selection = { rangeCount: 1, getRangeAt: () => range, removeAllRanges() {}, addRange() {} };
  const document = { createElement: tag => new Element(tag), createRange: () => range.cloneRange(), querySelector: () => null, querySelectorAll: () => [] };
  const context = vm.createContext({ window: { getSelection: () => selection }, document, File, Blob, Uint8Array,
    crypto: { randomUUID: () => id }, URL: { createObjectURL(blob) { urls.push(blob); return 'blob:mock-' + urls.length; }, revokeObjectURL(url) { revoked.push(url); } } });
  vm.runInContext(source, context);
  const api = context.window.__academicKnowledgeImages;
  let owner = 'owner', changed = 0, idle = 0;
  const controller = api.create({ context: () => ({ owner, id: '5', active: true }), attachments: () => ({
    upload: async (...args) => { calls.push(['upload', ...args]); return options.upload ? options.upload(...args) : { id }; },
    download: async (...args) => { calls.push(['download', ...args]); return options.download ? options.download(...args) : { blob: png() }; }
  }), changed() { changed++; }, idle() { idle++; }, report: (...args) => reports.push(args) });
  return { api, controller, context, editor, toolbar, range, calls, reports, urls, revoked, Element, owner(value) { owner = value; }, changed: () => changed, idle: () => idle };
}

test('stable Markdown image references escape alt text, exclude inline code and never contain temporary URLs', () => {
  const h = harness(), text = '![a &quot;x&quot;](attachment:' + id + ')';
  const parsed = h.api.tokenize(text), html = parsed.restore(parsed.text);
  assert.match(html, /data-kb-image-id=/); assert.match(html, /alt="a &quot;x&quot;"/); assert.doesNotMatch(html, /src=|blob:|token=/);
  const code = h.api.tokenize('`' + text + '`'); assert.equal(code.restore(code.text), '`' + text + '`');
  const invalid = h.api.tokenize('![x](attachment:../../bad)'); assert.equal(invalid.text, '![x](attachment:../../bad)');
  const holder = new h.Element('div'); holder.innerHTML = html;
  assert.equal(h.api.serialize(holder.firstElementChild), '![a "x"](attachment:' + id + ')');
  holder.firstElementChild.setAttribute('data-kb-image-upload', 'pending'); assert.equal(h.api.serialize(holder.firstElementChild), '');
});

test('actual file signatures are checked, including disguised HTML, SVG, empty and oversize files', async () => {
  const h = harness(); assert.equal(await h.api.imageType(png()), 'image/png');
  await assert.rejects(h.api.imageType(new File(['<svg onload="bad">'], 'fake.png', { type: 'image/png' })), /仅支持/);
  await assert.rejects(h.api.imageType(new File([], 'empty.png')), /50 MB/);
  await assert.rejects(h.api.imageType({ size: 51 * 1024 * 1024 }), /50 MB/);
});

test('the Markdown renderer keeps images out of code and stores image IDs instead of downloaded URLs', () => {
  const h = harness(), escapeHtml = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  h.context.escapeHtml = escapeHtml;
  for (const name of ['normalizeKnowledgeColor', 'normalizeKnowledgeFontSize', 'findKnowledgeSpanEnd', 'extractKnowledgeColorTokens', 'restoreKnowledgeColorTokens', 'markdownInline', 'renderKnowledgeMarkdown']) {
    const at = app.indexOf('  function ' + name + '('); vm.runInContext(app.slice(at, app.indexOf('\n  function ', at + 1)), h.context);
  }
  const image = '![截图](attachment:' + id + ')';
  const rendered = h.context.renderKnowledgeMarkdown('前段\n\n' + image + '\n\n尾段\n\n');
  assert.equal((rendered.match(/data-kb-image-id=/g) || []).length, 1); assert.doesNotMatch(rendered, /blob:|token=/);
  assert.doesNotMatch(h.context.renderKnowledgeMarkdown('```\n' + image + '\n```'), /data-kb-image-id=/);
  assert.doesNotMatch(h.context.renderKnowledgeMarkdown('`' + image + '`'), /data-kb-image-id=/);
});

test('upload preserves the captured document, replaces its placeholder with a durable reference and notifies saving', async () => {
  const h = harness(); assert.equal(h.controller.upload(h.editor, [png()], h.range), true);
  assert.equal(h.controller.hasPending(), true);
  await h.controller.wait(); await tick();
  assert.equal(h.calls[0][1], 'knowledge'); assert.equal(h.calls[0][2], '5');
  const wrapper = h.editor.querySelector('[data-kb-image-id]'); assert.ok(wrapper);
  assert.equal(h.api.serialize(wrapper), '![截图.png](attachment:' + id + ')');
  assert.equal(h.controller.hasPending(), false); assert.ok(h.changed() >= 2); assert.equal(h.idle(), 1);
});

test('failed uploads block leaving until retry or removal; retry does not insert a duplicate image', async () => {
  let attempt = 0;
  const h = harness({ upload: async () => { if (!attempt++) throw Error('offline'); return { id }; } });
  h.controller.upload(h.editor, [png()], h.range);
  await assert.rejects(h.controller.wait(), /重试或移除/);
  const pending = h.editor.querySelector('[data-kb-image-upload]'); assert.ok(pending); assert.equal(pending.children[1].hidden, false);
  pending.children[1].events.click(); await h.controller.wait();
  assert.equal(h.editor.querySelectorAll('[data-kb-image-id]').length, 1);
  const removed = harness({ upload: async () => { throw Error('offline'); } });
  removed.controller.upload(removed.editor, [png()], removed.range); await assert.rejects(removed.controller.wait());
  removed.editor.querySelector('[data-kb-image-upload]').children[2].events.click();
  assert.equal(removed.controller.hasPending(), false); assert.equal(removed.editor.children.length, 0);
});

test('account changes suppress late uploads and revoke cached image URLs', async () => {
  let finish;
  const h = harness({ upload: () => new Promise(resolve => { finish = resolve; }) });
  h.controller.upload(h.editor, [png()], h.range); await tick();
  h.owner('another'); h.controller.reset(); finish({ id }); await tick();
  assert.equal(h.editor.querySelectorAll('[data-kb-image-id]').length, 0);
  const loaded = harness(); loaded.controller.upload(loaded.editor, [png()], loaded.range); await loaded.controller.wait(); await tick();
  assert.equal(loaded.urls.length, 1); loaded.controller.reset(); assert.deepEqual(loaded.revoked, ['blob:mock-1']);
});

test('removing an in-flight placeholder releases a pending navigation wait and late results stay out of the document', async () => {
  let finish;
  const h = harness({ upload: () => new Promise(resolve => { finish = resolve; }) });
  h.controller.upload(h.editor, [png()], h.range); await tick();
  const waiting = h.controller.wait(); h.editor.querySelector('[data-kb-image-upload]').children[2].events.click();
  await waiting; assert.equal(h.controller.hasPending(), false);
  finish({ id }); await tick(); assert.equal(h.editor.querySelectorAll('[data-kb-image-id]').length, 0);
});

test('deleting a placeholder with the keyboard cannot leave an invisible failed upload blocking the editor', async () => {
  let finish;
  const h = harness({ upload: () => new Promise(resolve => { finish = resolve; }) });
  h.controller.upload(h.editor, [png()], h.range); await tick();
  h.editor.querySelector('[data-kb-image-upload]').remove();
  assert.equal(h.controller.hasPending(), false); await h.controller.wait();
  finish({ id }); await tick(); assert.equal(h.editor.children.length, 0);
});

test('a fresh controller reloads the same private attachment reference; failed reads can be retried', async () => {
  let attempt = 0;
  const h = harness({ download: async () => { if (!attempt++) throw Error('offline'); return { blob: png() }; } });
  const token = h.api.tokenize('![saved](attachment:' + id + ')'), holder = new h.Element('div'); holder.innerHTML = token.restore(token.text); h.editor.appendChild(holder.firstElementChild);
  h.controller.hydrate(h.editor); await tick();
  const wrapper = h.editor.querySelector('[data-kb-image-id]'), button = wrapper.querySelector('[data-kb-image-retry]');
  assert.match(button.textContent, /点击重试/); button.events.click(); await tick();
  assert.equal(h.calls[0][1], id); assert.equal(wrapper.querySelector('img').src, 'blob:mock-1');
});

test('ordinary image paste and drop handlers upload while text paste stays native', async () => {
  const h = harness(); h.controller.bind(h.editor, h.toolbar);
  let prevented = 0;
  h.editor.events.paste({ clipboardData: { files: [], items: [] }, preventDefault() { prevented++; } }); assert.equal(prevented, 0);
  h.editor.events.paste({ clipboardData: { files: [png()] }, preventDefault() { prevented++; } }); await h.controller.wait(); assert.equal(prevented, 1);
  h.editor.events.drop({ clientX: 0, clientY: 0, dataTransfer: { files: [png()] }, preventDefault() { prevented++; } }); await h.controller.wait(); assert.equal(prevented, 2);
  assert.equal(h.calls.filter(call => call[0] === 'upload').length, 2);
});

test('autosave flush waits for images and keeps failed images counted as unsaved', async () => {
  let ready, pending = true, writes = 0;
  const ctx = vm.createContext({ knowledgeImages: { hasPending: () => pending, wait: () => new Promise(resolve => { ready = () => { pending = false; resolve(); }; }) },
    autoSaveSlots: { 'knowledge:5': { dirty: true, revision: 1, payload: {} } }, autoSaveChain: Promise.resolve(), autoSaveRunning: 0,
    runAutoSave() { writes++; ctx.autoSaveSlots['knowledge:5'].dirty = false; return Promise.resolve(); }, clearTimeout });
  for (const name of ['hasUnsavedChanges', 'flushAutoSaveKey']) { const at = app.indexOf('  function ' + name + '('); vm.runInContext(app.slice(at, app.indexOf('\n  function ', at + 1)), ctx); }
  assert.equal(ctx.hasUnsavedChanges(), true); const saving = ctx.flushAutoSaveKey('knowledge:5'); assert.equal(writes, 0); ready(); await saving; assert.equal(writes, 1); assert.equal(ctx.hasUnsavedChanges(), false);
  pending = true; ctx.knowledgeImages.wait = async () => { throw Error('retry image'); }; await assert.rejects(ctx.flushAutoSaveKey('knowledge:5'), /retry image/); assert.equal(ctx.hasUnsavedChanges(), true);
});
