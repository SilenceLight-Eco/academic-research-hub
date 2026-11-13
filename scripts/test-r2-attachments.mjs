import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHandler, MAX_BYTES, validateFile, validateParts } from '../supabase/functions/r2-attachments/core.mjs';
const owner = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const MiB = 1024 * 1024;
function backend(options = {}) {
  const tables = { r2_attachment_uploads: [], research_attachments: [] }, calls = [], objects = new Map();
  let partRows = [], nextInsertFailure = false;
  const store = {
    create: async () => 'upload-token', emptyUrl: async () => 'https://private.invalid/empty',
    partUrl: async () => 'https://private.invalid/part',
    head: async row => objects.get(row.object_path) || null,
    parts: async () => partRows,
    complete: async row => { objects.set(row.object_path, { size: row.file_size }); calls.push('complete'); },
    abort: async () => calls.push('abort'),
    downloadUrl: async () => 'https://private.invalid/file',
    remove: async row => { objects.delete(row.object_path); calls.push('remove'); }
  };
  async function db(path, method = 'GET', body) {
    calls.push([path, method]);
    const parsed = new URL('https://db.invalid/' + path), table = tables[parsed.pathname.slice(1)];
    const matches = row => [...parsed.searchParams].every(([key, value]) => !value.startsWith('eq.') || String(row[key]) === value.slice(3));
    if (method === 'GET') return structuredClone(table.filter(matches));
    if (method === 'POST') {
      if (table === tables.research_attachments && nextInsertFailure) { nextInsertFailure = false; throw new Error('lost database connection'); }
      if (!table.some(row => row.id === body.id)) table.push(structuredClone({ status: 'starting', ...body }));
      return [structuredClone(body)];
    }
    if (method === 'PATCH') return table.filter(matches).map(row => { Object.assign(row, body); return structuredClone(row); });
    if (method === 'DELETE') { table.splice(0, table.length, ...table.filter(row => !matches(row))); return []; }
  }
  const handler = createHandler({ ready: true, auth: async token => token === 'Bearer good' ? { id: owner } : token === 'Bearer other' ? { id: 'other-user' } : null,
    uuid: () => id, db, store, log: () => {}, ...options });
  async function request(body, token = 'good', origin = 'https://silencelight-eco.github.io') {
    const response = await handler(new Request('https://function.invalid', { method: 'POST', headers: { authorization: 'Bearer ' + token, origin }, body: JSON.stringify(body) }));
    return { status: response.status, data: await response.json() };
  }
  async function create(size = 70 * MiB) {
    const result = await request({ action: 'create', kind: 'paper', contextId: 'replication_task_data', name: '数据.dta', size, type: 'application/octet-stream' });
    assert.equal(result.status, 200); const row = tables.r2_attachment_uploads[0];
    partRows = Array.from({ length: Math.ceil(size / row.part_size) }, (_, i) => ({ PartNumber: i + 1, ETag: 'part' + i, Size: Math.min(row.part_size, size - i * row.part_size) }));
    return row;
  }
  return { request, create, tables, calls, objects, store, setParts: rows => { partRows = rows; }, failMetadataOnce: () => { nextInsertFailure = true; } };
}
test('file bounds and multipart lengths are checked against real server parts', () => {
  const file = validateFile({ kind: 'paper', contextId: 'safe', name: '数据.dta', size: MAX_BYTES });
  assert.ok(Math.ceil(file.file_size / file.part_size) <= 10000);
  for (const patch of [{ size: MAX_BYTES + 1 }, { size: -1 }, { size: 0.5 }, { kind: 'bad' }, { contextId: '../x' }, { name: 'x\nheader' }]) {
    assert.throws(() => validateFile({ kind: 'paper', contextId: 'safe', name: 'valid', size: 5, ...patch }));
  }
  const row = { file_size: 70 * MiB, part_size: 64 * MiB };
  const good = [{ PartNumber: 1, Size: 64 * MiB, ETag: 'one' }, { PartNumber: 2, Size: 6 * MiB, ETag: 'two' }];
  assert.equal(validateParts(row, good).length, 2);
  for (const parts of [good.slice(0, 1), [...good].reverse(), good.map(x => ({ ...x, Size: x.Size - 1 })), good.map(x => ({ ...x, ETag: '' }))]) assert.throws(() => validateParts(row, parts));
});
test('authentication and allowed origin are required before any database or object access', async () => {
  const h = backend();
  assert.equal((await h.request({ action: 'capabilities' }, 'bad')).status, 401);
  assert.equal((await h.request({ action: 'create' }, 'good', 'https://untrusted.invalid')).status, 403);
  assert.equal(h.calls.length, 0);
  assert.equal((await backend({ ready: false }).request({ action: 'capabilities' })).data.ready, false);
  assert.equal((await backend({ ready: false }).request({ action: 'create' })).status, 503);
});
test('uploads are owner-scoped and invalid part numbers or foreign IDs cannot be signed', async () => {
  const h = backend(); await h.create();
  for (const action of ['part', 'complete', 'abort', 'download', 'remove']) assert.equal((await h.request({ action, id, part: 1 }, 'other')).status, 404);
  for (const part of [0, 3, -1, 1.5, '1']) assert.equal((await h.request({ action: 'part', id, part })).status, 400);
  assert.equal((await h.request({ action: 'part', id, part: 2 })).status, 200);
  assert.deepEqual((await h.request({ action: 'pending', kind: 'paper', contextId: 'replication_task_data' }, 'other')).data.uploads, []);
});
test('a completed multipart object creates one metadata record and completion is idempotent', async () => {
  const h = backend(); const row = await h.create();
  assert.equal(h.tables.research_attachments.length, 0);
  for (let i = 0; i < 2; i++) assert.equal((await h.request({ action: 'complete', id })).data.file.storage_provider, 'r2');
  assert.equal(h.tables.research_attachments.length, 1);
  assert.equal(h.calls.filter(x => x === 'complete').length, 1);
  assert.equal(row.user_id, owner);
  assert.equal((await h.request({ action: 'download', id })).status, 200);
  assert.equal((await h.request({ action: 'remove', id })).status, 200);
  assert.equal(h.tables.research_attachments.length, 0);
  assert.equal((await h.request({ action: 'complete', id })).status, 404);
});
test('completion lost after object creation can be recovered without uploading or duplicating data', async () => {
  const h = backend(); await h.create(); h.failMetadataOnce();
  assert.equal((await h.request({ action: 'complete', id })).status, 500);
  assert.equal(h.tables.r2_attachment_uploads[0].status, 'completing');
  const pending = await h.request({ action: 'pending', kind: 'paper', contextId: 'replication_task_data' });
  assert.equal(pending.data.uploads[0].id, id);
  assert.equal((await h.request({ action: 'complete', id })).status, 200);
  assert.equal(h.tables.research_attachments.length, 1);
  assert.equal(h.calls.filter(x => x === 'complete').length, 1);
});
test('zero-byte files require a verified object, wrong object sizes are never registered, and abort prevents completion', async () => {
  const empty = backend(); const row = await empty.create(0);
  assert.equal((await empty.request({ action: 'complete', id })).status, 400);
  empty.objects.set(row.object_path, { size: 0 });
  assert.equal((await empty.request({ action: 'complete', id })).status, 200);
  const wrong = backend(); const badRow = await wrong.create(); wrong.objects.set(badRow.object_path, { size: 2 });
  assert.equal((await wrong.request({ action: 'complete', id })).status, 400);
  assert.equal(wrong.tables.research_attachments.length, 0);
  const aborted = backend(); await aborted.create(); await aborted.request({ action: 'abort', id });
  assert.equal((await aborted.request({ action: 'complete', id })).status, 400);
  assert.ok(aborted.calls.includes('abort'));
});
test('invalid files return useful validation errors, and provider failures do not disclose credentials', async () => {
  const h = backend();
  assert.equal((await h.request({ action: 'create', kind: 'paper', contextId: 'x', name: 'x', size: -1 })).status, 400);
  h.store.create = async () => { throw new Error('Secret=DO_NOT_DISCLOSE'); };
  const result = await h.request({ action: 'create', kind: 'paper', contextId: 'x', name: 'x', size: 10 });
  assert.equal(result.status, 500); assert.ok(!JSON.stringify(result.data).includes('DO_NOT_DISCLOSE'));
});

function browserHarness(options = {}) {
  const requests = [], chunks = [], sent = [], progress = []; let activeOwner = owner, completeAttempts = 0, partAttempts = 0;
  class XHR {
    upload = {}; status = 200;
    open(method, url) { this.url = url; assert.equal(method, 'PUT'); }
    send(chunk) { sent.push(chunk); this.upload.onprogress?.({ loaded: chunk.size }); if (options.failPartOnce && partAttempts++ === 0) this.onerror(); else this.onload(); }
  }
  const context = vm.createContext({ window: {}, XMLHttpRequest: XHR, Date, Promise, Error });
  vm.runInContext(fs.readFileSync(new URL('../web/r2-attachments.js', import.meta.url), 'utf8'), context);
  const rpc = async (body, session) => {
    requests.push({ ...body, owner: session.user.id });
    if (body.action === 'capabilities') { if (options.missing) throw Object.assign(new Error('Not found'), { status: 404 }); return { ready: true, maxBytes: MAX_BYTES }; }
    if (body.action === 'create') return { id, partSize: 64 * MiB };
    if (body.action === 'part') { if (options.switchOwner) activeOwner = 'other'; return { url: 'https://private.invalid/part' }; }
    if (body.action === 'complete') { completeAttempts++; if (completeAttempts <= (options.failCompletion || 0)) throw new Error('Network error'); return { file: { id } }; }
    if (body.action === 'pending') return { uploads: [{ id }] };
    return {};
  };
  const session = { user: { id: owner } };
  const adapter = context.window.__academicR2(rpc, async () => ({ user: { id: activeOwner } }));
  const file = { name: 'big.dta', size: 70 * MiB, type: 'application/octet-stream', slice(start, end) { chunks.push([start, end]); return { size: end - start }; } };
  return { adapter, file, session, requests, chunks, sent, progress, upload: () => adapter.upload('paper', 'task_data', file, session, x => progress.push(x)) };
}
test('browser streams slices above 50 MB, signs each part, retries failed parts and completes before 100%', async () => {
  const h = browserHarness({ failPartOnce: true, failCompletion: 1 });
  await h.upload();
  assert.equal(h.sent.length, 3); assert.equal(h.sent[0].size, 64 * MiB); assert.equal(h.sent[2].size, 6 * MiB);
  assert.equal(h.requests.filter(x => x.action === 'complete').length, 2);
  assert.equal(h.progress.at(-1), 100); assert.ok(h.progress.slice(0, -1).every(x => x < 100));
  assert.ok(h.requests.every(x => x.owner === owner));
});
test('account changes stop the remaining requests and ambiguous completion is recoverable, never aborted', async () => {
  const switched = browserHarness({ switchOwner: true });
  await assert.rejects(switched.upload(), /账号已切换/);
  assert.ok(switched.requests.every(x => x.owner === owner));
  const uncertain = browserHarness({ failCompletion: 3 });
  await assert.rejects(uncertain.upload(), /上传编号/);
  assert.equal(uncertain.requests.filter(x => x.action === 'abort').length, 0);
  await uncertain.adapter.recover('paper', 'task_data');
  assert.equal(uncertain.requests.filter(x => x.action === 'complete').length, 4);
});
test('a not-yet-deployed R2 service falls back to existing storage capability', async () => {
  const h = browserHarness({ missing: true });
  const result = await h.adapter.capabilities(); assert.equal(result.ready, false); assert.equal(result.maxBytes, 50 * MiB);
});

function attachmentApiHarness({ enabled = false, provider = 'supabase' } = {}) {
  const calls = [], metadata = { id, object_path: owner + '/paper/file', file_name: 'file.dta', storage_provider: provider };
  const storage = {
    download: async path => { calls.push('storage-download'); return { data: 'legacy-blob' }; },
    remove: async () => { calls.push('storage-remove'); return {}; },
    upload: async () => { calls.push('storage-upload'); return {}; }
  };
  const builder = { select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; },
    insert() { calls.push('metadata-insert'); return this; }, delete() { calls.push('metadata-delete'); return this; },
    single: async () => ({ data: metadata }), then(resolve, reject) { return Promise.resolve({ data: [metadata] }).then(resolve, reject); } };
  const window = { __academicAuthReady: Promise.resolve(), __academicR2UploadsEnabled: enabled,
    __academicR2: () => ({ capabilities: async () => { calls.push('capabilities'); return { ready: true, maxBytes: MAX_BYTES }; },
      upload: async () => { calls.push('r2-upload'); return metadata; }, recover: async () => calls.push('recover'),
      call: async body => { calls.push('r2-' + body.action); return { url: 'https://private.invalid/download', name: metadata.file_name }; } }),
    __nativeFetch: async () => { calls.push('signed-fetch'); return { ok: true, blob: async () => 'r2-blob' }; } };
  const client = { auth: { getSession: async () => ({ data: { session: { user: { id: owner } } } }) }, from: () => builder, storage: { from: () => storage } };
  const source = fs.readFileSync(new URL('../web/static-api.js', import.meta.url), 'utf8');
  const block = source.slice(source.indexOf("  var attachmentBucket ="), source.indexOf('  async function readAllOwnRows'));
  vm.runInNewContext(block, { window, client, crypto: { randomUUID: () => id }, Promise, Number });
  return { api: window.__academicAttachments, calls };
}
test('disabled R2 never contacts an undeployed function and existing Supabase attachments remain usable', async () => {
  const h = attachmentApiHarness();
  await h.api.list('paper', 'task');
  assert.equal((await h.api.download(id)).blob, 'legacy-blob');
  await h.api.upload('paper', 'task', { name: 'file.dta', size: 5 });
  await h.api.remove(id);
  assert.ok(h.calls.includes('storage-upload')); assert.ok(h.calls.includes('storage-remove'));
  assert.ok(!h.calls.some(x => x.startsWith('r2-') || x === 'capabilities' || x === 'recover'));
  await assert.rejects(h.api.upload('paper', 'task', { name: 'large', size: 51 * MiB }), /R2 尚未启用/);
});
test('enabled R2 routes large uploads and R2 downloads without changing legacy downloads or buffering normal R2 downloads', async () => {
  const legacy = attachmentApiHarness({ enabled: true });
  assert.equal((await legacy.api.download(id)).blob, 'legacy-blob');
  const h = attachmentApiHarness({ enabled: true, provider: 'r2' });
  await h.api.list('paper', 'task'); await h.api.upload('paper', 'task', { name: 'large', size: 51 * MiB });
  const downloaded = await h.api.download(id); assert.ok(downloaded.url); assert.equal(downloaded.blob, undefined);
  assert.ok(!h.calls.includes('signed-fetch'));
  assert.equal((await h.api.download(id, { blob: true })).blob, 'r2-blob');
  await h.api.remove(id);
  assert.ok(h.calls.includes('r2-upload')); assert.ok(h.calls.includes('r2-remove')); assert.ok(h.calls.includes('recover'));
  assert.ok(!h.calls.includes('storage-upload')); assert.ok(!h.calls.includes('storage-remove'));
});
