const corsHeaders = {
  "Access-Control-Allow-Origin": "https://silencelight-eco.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve((request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return new Response(JSON.stringify({
    ok: false,
    error: "此旧版导出接口已停用，请先连接飞书账号后使用新的同步服务",
  }), {
    status: 410,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
});
