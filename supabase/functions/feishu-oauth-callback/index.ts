const callbackUrl = "https://gqopwqpysoixcgdacurx.supabase.co/functions/v1/feishu-oauth-callback";
const appUrl = "https://silencelight-eco.github.io/academic-research-hub/";

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

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function redirect(status: "connected" | "error", detail?: string) {
  const url = new URL(appUrl);
  url.searchParams.set("feishu", status);
  if (detail) url.searchParams.set("feishu_detail", detail);
  return Response.redirect(url.toString(), 303);
}

Deno.serve(async (request: Request) => {
  if (request.method !== "GET") return redirect("error", "invalid_callback");
  const url = new URL(request.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  if (!code || !state || state.length > 256) return redirect("error", "missing_code_or_state");
  if (!supabaseUrl || !serviceKey) return redirect("error", "server_config_missing");

  try {
    const appId = Deno.env.get("FEISHU_APP_ID") || "";
    const appSecret = Deno.env.get("FEISHU_APP_SECRET") || "";
    if (!appId || !appSecret) return redirect("error", "app_credentials_missing");

    const stateHash = await sha256(state);
    const stateResponse = await fetch(`${supabaseUrl}/rest/v1/feishu_oauth_states?state_hash=eq.${stateHash}&select=user_id,expires_at`, {
      headers: serviceHeaders(),
    });
    const states = await stateResponse.json().catch(() => []);
    const savedState = Array.isArray(states) ? states[0] : null;
    if (!stateResponse.ok || !savedState || Date.parse(String(savedState.expires_at || "")) < Date.now()) return redirect("error", "state_invalid_or_expired");

    await fetch(`${supabaseUrl}/rest/v1/feishu_oauth_states?state_hash=eq.${stateHash}`, {
      method: "DELETE",
      headers: serviceHeaders({ Prefer: "return=minimal" }),
    });

    const exchangeResponse = await fetch("https://open.feishu.cn/open-apis/authen/v2/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ grant_type: "authorization_code", code, client_id: appId, client_secret: appSecret, redirect_uri: callbackUrl }),
    });
    const tokenEnvelope = await exchangeResponse.json().catch(() => ({}));
    const tokenData = tokenEnvelope.data && typeof tokenEnvelope.data === "object" ? tokenEnvelope.data : tokenEnvelope;
    const apiError = tokenEnvelope.code !== undefined && Number(tokenEnvelope.code) !== 0;
    if (!exchangeResponse.ok || apiError || !tokenData.access_token) {
      console.error("[feishu-oauth-callback] token_exchange_failed");
      return redirect("error", "token_exchange_failed");
    }

    const expiresAt = new Date(Date.now() + Number(tokenData.expires_in || 0) * 1000).toISOString();
    const refreshExpiresAt = tokenData.refresh_token_expires_in
      ? new Date(Date.now() + Number(tokenData.refresh_token_expires_in) * 1000).toISOString()
      : null;
    const tokenRow = {
      user_id: savedState.user_id,
      access_token: tokenData.access_token,
      // Some authorizations return a short-lived access token without offline
      // access. Keep the connection usable now; the sync function will ask the
      // user to reconnect once that access token expires.
      refresh_token: String(tokenData.refresh_token || ""),
      expires_at: expiresAt,
      refresh_expires_at: refreshExpiresAt,
      open_id: tokenData.open_id || null,
      tenant_key: tokenData.tenant_key || null,
      scope: tokenData.scope || null,
      updated_at: new Date().toISOString(),
    };
    const saveResponse = await fetch(`${supabaseUrl}/rest/v1/feishu_user_tokens?on_conflict=user_id`, {
      method: "POST",
      headers: serviceHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify(tokenRow),
    });
    if (!saveResponse.ok) {
      console.error("[feishu-oauth-callback] token_store_failed");
      return redirect("error", "token_store_failed");
    }
    return redirect("connected", tokenData.refresh_token ? undefined : "refresh_unavailable");
  } catch {
    console.error("[feishu-oauth-callback] callback_failed");
    return redirect("error", "callback_failed");
  }
});
