const allowedOrigins = new Set([
  "https://silencelight-eco.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://silencelight-eco.github.io",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(request: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json; charset=utf-8" },
  });
}

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function serviceHeaders(extra: Record<string, string> = {}) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function authenticate(request: Request): Promise<string> {
  const authorization = request.headers.get("authorization") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!authorization || !anonKey || !supabaseUrl) throw new Error("请先登录工作台");
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: authorization } });
  if (!response.ok) throw new Error("登录已过期，请重新登录工作台");
  const user = await response.json();
  if (typeof user.id !== "string") throw new Error("无法识别当前工作台账号");
  return user.id;
}

type StoredToken = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  refresh_expires_at?: string | null;
};

async function saveToken(userId: string, data: Record<string, unknown>, previousRefreshToken = ""): Promise<void> {
  const row = {
    user_id: userId,
    access_token: String(data.access_token || ""),
    refresh_token: String(data.refresh_token || previousRefreshToken),
    expires_at: new Date(Date.now() + Number(data.expires_in || 0) * 1000).toISOString(),
    refresh_expires_at: data.refresh_token_expires_in
      ? new Date(Date.now() + Number(data.refresh_token_expires_in) * 1000).toISOString()
      : null,
    open_id: data.open_id || null,
    tenant_key: data.tenant_key || null,
    scope: data.scope || null,
    updated_at: new Date().toISOString(),
  };
  const response = await fetch(`${supabaseUrl}/rest/v1/feishu_user_tokens?on_conflict=user_id`, {
    method: "POST",
    headers: serviceHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify(row),
  });
  if (!response.ok) throw new Error("无法保存飞书授权状态");
}

async function getAccessToken(userId: string): Promise<string> {
  const response = await fetch(`${supabaseUrl}/rest/v1/feishu_user_tokens?user_id=eq.${encodeURIComponent(userId)}&select=access_token,refresh_token,expires_at,refresh_expires_at`, {
    headers: serviceHeaders(),
  });
  const rows = await response.json().catch(() => []);
  const token = Array.isArray(rows) ? rows[0] as StoredToken | undefined : undefined;
  if (!response.ok || !token) throw new Error("请先连接飞书账号");
  if (Date.parse(token.expires_at) > Date.now() + 60_000) return token.access_token;
  if (!token.refresh_token) throw new Error("飞书授权已过期，且当前授权无法自动续期，请重新连接飞书");
  if (token.refresh_expires_at && Date.parse(token.refresh_expires_at) <= Date.now()) throw new Error("飞书授权已过期，请重新连接飞书");

  const appId = Deno.env.get("FEISHU_APP_ID") || "";
  const appSecret = Deno.env.get("FEISHU_APP_SECRET") || "";
  if (!appId || !appSecret) throw new Error("飞书服务尚未完成配置");
  const refreshResponse = await fetch("https://open.feishu.cn/open-apis/authen/v2/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ grant_type: "refresh_token", refresh_token: token.refresh_token, client_id: appId, client_secret: appSecret }),
  });
  const refreshEnvelope = await refreshResponse.json().catch(() => ({}));
  const refreshData = refreshEnvelope.data && typeof refreshEnvelope.data === "object" ? refreshEnvelope.data : refreshEnvelope;
  const refreshError = refreshEnvelope.code !== undefined && Number(refreshEnvelope.code) !== 0;
  if (!refreshResponse.ok || refreshError || !refreshData.access_token || !refreshData.refresh_token) {
    throw new Error("飞书授权已过期，请重新连接飞书");
  }
  await saveToken(userId, refreshData, token.refresh_token);
  return String(refreshData.access_token);
}

async function feishuRequest(path: string, token: string, method = "GET", body?: unknown): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let response: Response;
  try {
    response = await fetch(`https://open.feishu.cn/open-apis${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("飞书文档 API 响应超时（15 秒），请稍后重试");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || (result.code !== undefined && Number(result.code) !== 0)) {
    const code = Number(result.code);
    const rawMessage = String(result.msg || result.message || result.error_description || "");
    const safeMessage = rawMessage
      .replace(/Bearer\s+\S+/gi, "Bearer [已隐藏]")
      .replace(/(access[_ -]?token|refresh[_ -]?token|app[_ -]?secret)\s*[:=]\s*[^,;\s]+/gi, "$1=[已隐藏]")
      .replace(/[\r\n<>]/g, " ")
      .slice(0, 240);
    const codeLabel = Number.isFinite(code) ? `错误码 ${code}` : `HTTP ${response.status}`;
    const detail = safeMessage ? `：${safeMessage}` : "";
    const hint = Number.isFinite(code) && (code === 99991663 || code === 99991672)
      ? "；请确认已开通并发布“创建及编辑新版文档（docx:document）”用户权限，然后重新授权"
      : "；请确认当前用户有权访问该文档，且应用已获对应文档权限";
    throw new Error(`飞书文档 API ${codeLabel}${detail}${hint}`);
  }
  return result.data || {};
}

function safeDocumentId(value: unknown): string {
  const id = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(id)) throw new Error("飞书文档链接无效，请粘贴完整链接");
  return id;
}

function blockText(block: Record<string, unknown>): string {
  const type = Number(block.block_type || 0);
  const propertyNames: Record<number, string> = { 2: "text", 3: "heading1", 4: "heading2", 5: "heading3", 6: "heading4", 7: "heading5", 8: "heading6", 12: "bullet", 13: "ordered", 14: "code", 15: "quote" };
  const propertyName = propertyNames[type];
  if (!propertyName) return "";
  const property = block[propertyName] as Record<string, unknown> | undefined;
  const elements = property && Array.isArray(property.elements) ? property.elements : [];
  const text = elements.map((element) => {
    const record = element as Record<string, unknown>;
    const run = record.text_run as Record<string, unknown> | undefined;
    return typeof run?.content === "string" ? run.content : "";
  }).join("");
  if (!text) return "";
  if (type >= 3 && type <= 8) return `${"#".repeat(type - 2)} ${text}`;
  if (type === 12) return `- ${text}`;
  if (type === 13) return `1. ${text}`;
  if (type === 15) return `> ${text}`;
  return text;
}

async function importDocument(documentId: string, token: string) {
  const doc = await feishuRequest(`/docx/v1/documents/${encodeURIComponent(documentId)}`, token);
  const document = doc.document as Record<string, unknown> | undefined;
  const blocks: string[] = [];
  let pageToken = "";
  for (let page = 0; page < 20; page += 1) {
    const query = new URLSearchParams({ page_size: "500" });
    if (pageToken) query.set("page_token", pageToken);
    const data = await feishuRequest(`/docx/v1/documents/${encodeURIComponent(documentId)}/blocks?${query.toString()}`, token);
    const items = Array.isArray(data.items) ? data.items as Record<string, unknown>[] : [];
    items.forEach((block) => { const content = blockText(block); if (content) blocks.push(content); });
    if (data.has_more !== true) break;
    pageToken = String(data.page_token || "");
    if (!pageToken) break;
  }
  return {
    title: String(document?.title || "飞书文档"),
    markdown: blocks.join("\n\n").slice(0, 100_000),
    documentId,
    documentUrl: `https://feishu.cn/docx/${encodeURIComponent(documentId)}`,
  };
}

async function exportDocument(title: string, markdown: string, token: string) {
  const converted = await feishuRequest("/docx/v1/documents/blocks/convert", token, "POST", { content_type: "markdown", content: markdown });
  const blocks = Array.isArray(converted.blocks) ? converted.blocks as Record<string, unknown>[] : [];
  const firstLevelBlockIds = Array.isArray(converted.first_level_block_ids) ? converted.first_level_block_ids : [];
  if (!blocks.length || !firstLevelBlockIds.length) throw new Error("飞书没有从这段 Markdown 生成可写入的内容");
  if (blocks.length > 1000 || firstLevelBlockIds.length > 1000) throw new Error("内容过长，请拆分后再导出");
  function removeMergeInfo(value: unknown): void {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(removeMergeInfo); return; }
    const record = value as Record<string, unknown>;
    if (record.property && typeof record.property === "object") delete (record.property as Record<string, unknown>).merge_info;
    Object.values(record).forEach(removeMergeInfo);
  }
  removeMergeInfo(blocks);
  const created = await feishuRequest("/docx/v1/documents", token, "POST", { title });
  const document = created.document as Record<string, unknown> | undefined;
  const documentId = String(document?.document_id || "");
  if (!documentId) throw new Error("飞书没有返回新文档编号");
  await feishuRequest(`/docx/v1/documents/${encodeURIComponent(documentId)}/blocks/${encodeURIComponent(documentId)}/descendant`, token, "POST", {
    children_id: firstLevelBlockIds,
    descendants: blocks,
    index: 0,
  });
  return { documentId, documentUrl: `https://feishu.cn/docx/${encodeURIComponent(documentId)}`, title };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { ok: false, error: "仅支持 POST 请求" }, 405);
  const origin = request.headers.get("origin") || "";
  if (origin && !allowedOrigins.has(origin)) return json(request, { ok: false, error: "来源地址不受支持" }, 403);

  try {
    const userId = await authenticate(request);
    const input = await request.json();
    const action = String(input.action || "");
    if (action === "status") {
      const response = await fetch(`${supabaseUrl}/rest/v1/feishu_user_tokens?user_id=eq.${encodeURIComponent(userId)}&select=open_id,updated_at`, { headers: serviceHeaders() });
      const rows = await response.json().catch(() => []);
      if (!response.ok) throw new Error("无法读取飞书连接状态");
      const row = Array.isArray(rows) ? rows[0] : null;
      return json(request, { ok: true, connected: Boolean(row), updatedAt: row?.updated_at || null });
    }
    const token = await getAccessToken(userId);
    if (action === "import") {
      const documentId = safeDocumentId(input.documentId);
      return json(request, { ok: true, ...(await importDocument(documentId, token)) });
    }
    if (action === "export") {
      const title = String(input.title || "未命名文档").trim().slice(0, 200) || "未命名文档";
      const markdown = String(input.markdown || "");
      if (!markdown.trim()) return json(request, { ok: false, error: "文档内容为空，暂时无法导出" }, 400);
      if (markdown.length > 50_000) return json(request, { ok: false, error: "单次导出最多支持 50,000 个字符" }, 413);
      return json(request, { ok: true, ...(await exportDocument(title, markdown, token)) });
    }
    return json(request, { ok: false, error: "不支持的飞书操作" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "飞书操作失败";
    const status = message.includes("登录") ? 401 : message.includes("连接飞书") || message.includes("授权") ? 403 : 500;
    return json(request, { ok: false, error: message }, status);
  }
});
