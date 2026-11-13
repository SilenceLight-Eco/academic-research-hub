export const MAX_BYTES = 5000000000000;
const MiB = 1024 * 1024;
const origins = new Set(['https://silencelight-eco.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000']);
const fields = 'id,file_name,file_size,content_type,created_at,storage_provider';
export function validateFile(body) {
  if (!['knowledge', 'project', 'reference', 'paper'].includes(body.kind) || !/^[A-Za-z0-9_-]{1,120}$/.test(body.contextId || '')) throw failure('无效的附件归属');
  if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 255 || /[\x00-\x1f]/.test(body.name)) throw failure('无效的文件名');
  if (!Number.isSafeInteger(body.size) || body.size < 0 || body.size > MAX_BYTES) throw failure('文件超出 R2 支持的大小范围（最大5 TB）');
  return { context_kind: body.kind, context_id: body.contextId, file_name: body.name, file_size: body.size,
    content_type: typeof body.type === 'string' && /^[\w.+-]+\/[\w.+-]+$/.test(body.type) ? body.type : 'application/octet-stream',
    part_size: Math.max(64 * MiB, Math.ceil(body.size / 10000 / MiB) * MiB) };
}
export function validateParts(row, parts) {
  const count = Math.ceil(row.file_size / row.part_size);
  if (parts.length !== count || parts.some((p, i) => p.PartNumber !== i + 1 || !p.ETag || p.Size !== Math.min(row.part_size, row.file_size - i * row.part_size))) throw new Error('上传分片不完整，请重试上传');
  return parts.map(({ PartNumber, ETag }) => ({ PartNumber, ETag }));
}
function failure(message, status = 400) { return Object.assign(new Error(message), { status }); }
export function createHandler({ auth, db, store, ready, uuid = () => crypto.randomUUID(), log = console.error }) {
  return async function handle(req) {
    const origin = req.headers.get('origin');
    const cors = { 'Access-Control-Allow-Origin': origins.has(origin) ? origin : 'https://silencelight-eco.github.io',
      'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info', 'Access-Control-Allow-Methods': 'POST,OPTIONS', Vary: 'Origin' };
    function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }); }
    if (origin && !origins.has(origin)) return json({ error: '来源不允许' }, 403);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return json({ error: '仅支持 POST' }, 405);
    try {
      const user = await auth(req.headers.get('authorization') || '');
      if (!user?.id) throw failure('请重新登录后使用附件', 401);
      if (Number(req.headers.get('content-length')) > 8192) throw failure('请求过大', 413);
      const raw = await req.text();
      if (raw.length > 8192) throw failure('请求过大', 413);
      const body = JSON.parse(raw);
      if (body.action === 'capabilities') return json({ ready, maxBytes: ready ? MAX_BYTES : 50 * MiB });
      if (!ready) throw failure('R2 尚未配置完成，请先启用 R2 并设置后端密钥', 503);
      const eq = value => encodeURIComponent(String(value));
      if (body.action === 'pending') {
        validateFile({ ...body, name: 'pending', size: 0 });
        const rows = await db(`r2_attachment_uploads?user_id=eq.${eq(user.id)}&context_kind=eq.${eq(body.kind)}&context_id=eq.${eq(body.contextId)}&status=eq.completing&select=id&limit=20`);
        return json({ uploads: rows });
      }
      if (body.action === 'create') {
        const file = validateFile(body), id = uuid();
        const row = { ...file, id, user_id: user.id, object_path: `${user.id}/${file.context_kind}/${id}` };
        await db('r2_attachment_uploads', 'POST', row);
        const uploadId = file.file_size ? await store.create(row) : null;
        try { await db(`r2_attachment_uploads?id=eq.${id}&user_id=eq.${eq(user.id)}`, 'PATCH', { upload_id: uploadId, status: 'uploading' }); }
        catch (error) { if (uploadId) await store.abort({ ...row, upload_id: uploadId }).catch(() => {}); throw error; }
        return json({ id, partSize: row.part_size, ...(file.file_size === 0 ? { url: await store.emptyUrl(row) } : {}) });
      }
      if (['download', 'remove'].includes(body.action)) {
        if (!/^[0-9a-f-]{36}$/i.test(body.id || '')) throw failure('无效的附件编号');
        const path = `research_attachments?id=eq.${eq(body.id)}&user_id=eq.${eq(user.id)}&storage_provider=eq.r2`;
        const row = (await db(path + '&select=*'))[0];
        if (!row) throw failure('附件不存在或无权访问', 404);
        if (body.action === 'download') return json({ url: await store.downloadUrl(row), name: row.file_name });
        // Deleting an object twice is safe, so a lost response can be retried.
        await store.remove(row);
        await db(path, 'DELETE');
        return json({ removed: true });
      }
      if (!/^[0-9a-f-]{36}$/i.test(body.id || '')) throw failure('无效的上传编号');
      const path = `r2_attachment_uploads?id=eq.${eq(body.id)}&user_id=eq.${eq(user.id)}`;
      let row = (await db(path + '&select=*'))[0];
      if (!row) throw failure('上传不存在或无权访问', 404);
      if (body.action === 'part') {
        const count = Math.ceil(row.file_size / row.part_size);
        if (row.status !== 'uploading' || !Number.isInteger(body.part) || body.part < 1 || body.part > count) throw failure('无效的上传分片');
        return json({ url: await store.partUrl(row, body.part) });
      }
      if (body.action === 'abort') {
        const claimed = await db(path + '&status=eq.uploading', 'PATCH', { status: 'aborted' });
        if (claimed.length && row.upload_id) await store.abort(row);
        return json({ aborted: claimed.length > 0 });
      }
      if (body.action !== 'complete') throw failure('无效的附件操作');
      if (row.status === 'aborted' || row.status === 'starting') throw failure('上传尚未就绪或已取消');
      if (row.status === 'complete') {
        const saved = (await db(`research_attachments?id=eq.${row.id}&user_id=eq.${eq(user.id)}&select=${fields}`))[0];
        if (!saved) throw failure('附件已删除，不能重复完成上传', 404);
        return json({ file: saved });
      }
      if (row.status === 'uploading') {
        const claimed = await db(path + '&status=eq.uploading', 'PATCH', { status: 'completing' });
        if (!claimed.length) throw failure('上传状态已变化，请重试', 409);
        row = claimed[0];
      }
      // HEAD also recovers a completed object if the previous completion response was lost.
      let head = await store.head(row);
      if (!head && row.file_size) {
        const parts = validateParts(row, await store.parts(row));
        try { await store.complete(row, parts); }
        catch (error) { if (!await store.head(row)) throw error; }
        head = await store.head(row);
      }
      if (!head || head.size !== row.file_size) throw failure('云端文件大小验证失败，请重试');
      const metadata = { id: row.id, user_id: user.id, context_kind: row.context_kind, context_id: row.context_id,
        file_name: row.file_name, file_size: row.file_size, content_type: row.content_type, object_path: row.object_path, storage_provider: 'r2' };
      await db('research_attachments?on_conflict=id', 'POST', metadata, 'resolution=ignore-duplicates,return=representation');
      await db(path, 'PATCH', { status: 'complete' });
      const saved = (await db(`research_attachments?id=eq.${row.id}&user_id=eq.${eq(user.id)}&select=${fields}`))[0];
      if (!saved) throw failure('附件信息未保存，请重试完成上传', 503);
      return json({ file: saved });
    } catch (error) {
      const status = error.status || (error instanceof SyntaxError ? 400 : 500);
      // Never return provider errors or signed URLs, which may contain credentials.
      if (status === 500) log('R2 attachment operation failed', error.name || 'Error');
      return json({ error: status === 500 ? 'R2 操作暂未完成，请检查存储配置后重试' : error.message }, status);
    }
  };
}
