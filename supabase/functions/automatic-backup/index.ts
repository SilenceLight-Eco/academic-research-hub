const allowedOrigins = new Set([
  "https://silencelight-eco.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://silencelight-eco.github.io",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

const json = (request: Request, body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json; charset=utf-8" },
  });

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const cronSecret = Deno.env.get("JOURNAL_TRACKER_CRON_SECRET") || "";

function serviceHeaders(extra: Record<string, string> = {}) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function rest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: serviceHeaders((init.headers || {}) as Record<string, string>),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "message" in payload
      ? String(payload.message)
      : "数据库操作失败";
    throw new Error(message);
  }
  return payload;
}

async function readAll(path: string) {
  const rows: Record<string, unknown>[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const page = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      headers: serviceHeaders({ Range: `${offset}-${offset + pageSize - 1}`, "Range-Unit": "items" }),
    });
    const payload = await page.json().catch(() => null);
    if (!page.ok) throw new Error("读取备份数据失败");
    const batch = Array.isArray(payload) ? payload as Record<string, unknown>[] : [];
    rows.push(...batch);
    if (batch.length < pageSize) return rows;
    if (rows.length > 100000) throw new Error("记录数量过多，已中止本次快照");
  }
}

async function createSnapshot(userId: string) {
  const workspaceRows = await rest(`user_workspaces?user_id=eq.${encodeURIComponent(userId)}&select=payload,updated_at&limit=1`);
  const workspace = Array.isArray(workspaceRows) && workspaceRows.length ? workspaceRows[0] as Record<string, unknown> : null;
  const [subscriptions, articles, attachmentRows] = await Promise.all([
    readAll(`journal_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.asc`),
    readAll(`journal_articles?user_id=eq.${encodeURIComponent(userId)}&select=*&order=discovered_at.asc`),
    readAll(`research_attachments?user_id=eq.${encodeURIComponent(userId)}&select=id,context_kind,context_id,file_name,file_size,content_type,created_at&order=created_at.asc`),
  ]);
  const payload = {
    format: "academic-research-hub-auto-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    workspace: {
      format: "academic-research-hub-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      data: workspace && workspace.payload && typeof workspace.payload === "object" ? workspace.payload : {},
    },
    journal: {
      subscriptions: subscriptions.map(({ user_id: _userId, ...row }) => row),
      articles: articles.map(({ user_id: _userId, ...row }) => row),
    },
    attachments: attachmentRows,
    attachmentFilesIncluded: false,
  };
  const workspaceBytes = new TextEncoder().encode(JSON.stringify(payload.workspace.data)).byteLength;
  const inserted = await rest("automatic_backups", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      user_id: userId,
      workspace_bytes: workspaceBytes,
      subscription_count: subscriptions.length,
      article_count: articles.length,
      attachment_count: attachmentRows.length,
      payload,
    }),
  });
  return { id: Array.isArray(inserted) && inserted[0] ? inserted[0].id : null, subscriptions: subscriptions.length, articles: articles.length, attachments: attachmentRows.length };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { ok: false, error: "仅支持 POST" }, 405);
  if (!supabaseUrl || !serviceKey || !cronSecret) return json(request, { ok: false, error: "自动备份服务尚未配置完成" }, 500);
  if (request.headers.get("x-cron-secret") !== cronSecret) return json(request, { ok: false, error: "定时任务凭证无效" }, 401);
  try {
    const preferences = await readAll("automatic_backup_preferences?enabled=eq.true&select=user_id");
    const results: Array<Record<string, unknown>> = [];
    for (const preference of preferences) {
      const userId = String(preference.user_id || "");
      if (!userId) continue;
      try {
        results.push({ user_id: userId, ok: true, ...(await createSnapshot(userId)) });
      } catch (error) {
        results.push({ user_id: userId, ok: false, error: error instanceof Error ? error.message : "快照失败" });
      }
    }
    return json(request, { ok: true, optedIn: preferences.length, results });
  } catch (error) {
    return json(request, { ok: false, error: error instanceof Error ? error.message : "自动备份失败" }, 500);
  }
});
