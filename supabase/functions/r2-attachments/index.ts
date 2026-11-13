import { S3Client, CreateMultipartUploadCommand, UploadPartCommand, ListPartsCommand,
  CompleteMultipartUploadCommand, AbortMultipartUploadCommand, HeadObjectCommand,
  GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from 'npm:@aws-sdk/client-s3@3.1165.0';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.1165.0';
import { createHandler } from './core.mjs';

const env = (key: string) => Deno.env.get(key) || '';
const supabase = env('SUPABASE_URL'), service = env('SUPABASE_SERVICE_ROLE_KEY');
const account = env('R2_ACCOUNT_ID'), bucket = env('R2_BUCKET_NAME');
const accessKeyId = env('R2_ACCESS_KEY_ID'), secretAccessKey = env('R2_SECRET_ACCESS_KEY');
const ready = Boolean(account && bucket && accessKeyId && secretAccessKey);
const s3 = new S3Client({ region: 'auto', endpoint: `https://${account || 'unconfigured'}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey }, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
  maxAttempts: 3 });
const base = (row: any) => ({ Bucket: bucket, Key: row.object_path });
const multi = (row: any) => ({ ...base(row), UploadId: row.upload_id });
async function db(path: string, method = 'GET', body?: unknown, prefer = 'return=representation') {
  const response = await fetch(`${supabase}/rest/v1/${path}`, { method,
    headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json', Prefer: prefer },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('Attachment database operation failed');
  return response.status === 204 ? [] : await response.json();
}
const store = {
  async create(row: any) { const r = await s3.send(new CreateMultipartUploadCommand({ ...base(row), ContentType: row.content_type })); if (!r.UploadId) throw new Error('No upload ID'); return r.UploadId; },
  partUrl: (row: any, part: number) => getSignedUrl(s3, new UploadPartCommand({ ...multi(row), PartNumber: part }), { expiresIn: 3600 }),
  emptyUrl: (row: any) => getSignedUrl(s3, new PutObjectCommand({ ...base(row), ContentType: row.content_type, ContentLength: 0 }), { expiresIn: 900 }),
  async parts(row: any) {
    const parts: any[] = []; let marker: string | undefined;
    do {
      const r = await s3.send(new ListPartsCommand({ ...multi(row), PartNumberMarker: marker }));
      parts.push(...(r.Parts || [])); marker = r.IsTruncated ? r.NextPartNumberMarker : undefined;
      if (r.IsTruncated && !marker) throw new Error('Invalid parts response');
    } while (marker);
    return parts;
  },
  complete: (row: any, parts: any[]) => s3.send(new CompleteMultipartUploadCommand({ ...multi(row), MultipartUpload: { Parts: parts } })),
  abort: (row: any) => s3.send(new AbortMultipartUploadCommand(multi(row))),
  async head(row: any) {
    try { const r = await s3.send(new HeadObjectCommand(base(row))); return { size: r.ContentLength }; }
    catch (e: any) { if (e.$metadata?.httpStatusCode === 404) return null; throw e; }
  },
  downloadUrl: (row: any) => getSignedUrl(s3, new GetObjectCommand({ ...base(row),
    ResponseContentDisposition: `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(row.file_name)}` }), { expiresIn: 300 }),
  remove: (row: any) => s3.send(new DeleteObjectCommand(base(row)))
};
Deno.serve(createHandler({ ready, db, store, async auth(authorization: string) {
  if (!/^Bearer \S+$/.test(authorization)) return null;
  const response = await fetch(`${supabase}/auth/v1/user`, { headers: { apikey: env('SUPABASE_ANON_KEY'), Authorization: authorization }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) return null;
  return await response.json();
} }));
