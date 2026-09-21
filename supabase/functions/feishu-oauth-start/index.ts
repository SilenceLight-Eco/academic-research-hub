const allowedOrigins = new Set([
  "https://silencelight-eco.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://silencelight-eco.github.io",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

const json = (request: Request, body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json; charset=utf-8" },
  });

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const callbackUrl = "https://gqopwqpysoixcgdacurx.supabase.co/functions/v1/feishu-oauth-callback";

function serviceHeaders(extra: Record<string, string> = {}) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { ok: false, error: "仅支持 POST 请求" }, 405);
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins.has(origin)) {
    return json(request, { ok: false, error: "来源地址不受支持" }, 403);
  }

  try {
    const appId = Deno.env.get("FEISHU_APP_ID");
    const authorization = request.headers.get("authorization") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    if (!appId || !supabaseUrl || !serviceKey || !authorization || !anonKey) {
      return json(request, { ok: false, error: "飞书授权服务尚未完成配置" }, 503);
    }

    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: authorization },
    });
    if (!userResponse.ok) return json(request, { ok: false, error: "请先登录工作台" }, 401);
    const user = await userResponse.json();
    const userId = typeof user.id === "string" ? user.id : "";
    if (!userId) return json(request, { ok: false, error: "无法识别当前工作台账号" }, 401);

    const state = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const stateHash = await sha256(state);
    const savedState = await fetch(`${supabaseUrl}/rest/v1/feishu_oauth_states`, {
      method: "POST",
      headers: serviceHeaders({ Prefer: "return=minimal" }),
      body: JSON.stringify({ state_hash: stateHash, user_id: userId, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() }),
    });
    if (!savedState.ok) return json(request, { ok: false, error: "无法创建飞书授权会话，请先完成数据库迁移" }, 503);

    const authUrl = new URL("https://open.feishu.cn/open-apis/authen/v1/index");
    authUrl.searchParams.set("app_id", appId);
    authUrl.searchParams.set("redirect_uri", callbackUrl);
    authUrl.searchParams.set("state", state);
    return json(request, { ok: true, authUrl: authUrl.toString() });
  } catch {
    return json(request, { ok: false, error: "无法启动飞书授权，请稍后重试" }, 500);
  }
});
