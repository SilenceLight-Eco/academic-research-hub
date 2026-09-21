const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });

async function feishuRequest(path: string, token: string, body: unknown) {
  const response = await fetch(`https://open.feishu.cn/open-apis${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.code !== 0) {
    const detail = typeof result.msg === "string" ? result.msg : `HTTP ${response.status}`;
    throw new Error(`飞书 API 调用失败：${detail}`);
  }
  return result.data || {};
}

function removeReadOnlyMergeInfo(value: unknown): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach(removeReadOnlyMergeInfo);
    return;
  }
  const record = value as Record<string, unknown>;
  if (record.property && typeof record.property === "object") {
    delete (record.property as Record<string, unknown>).merge_info;
  }
  Object.values(record).forEach(removeReadOnlyMergeInfo);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ ok: false, error: "仅支持 POST 请求" }, 405);

  try {
    const appId = Deno.env.get("FEISHU_APP_ID");
    const appSecret = Deno.env.get("FEISHU_APP_SECRET");
    if (!appId || !appSecret) {
      return json({ ok: false, error: "飞书导出尚未配置，请先设置 Supabase 的 FEISHU_APP_ID 和 FEISHU_APP_SECRET" }, 503);
    }

    const input = await request.json();
    const title = String(input.title || "未命名文档").trim().slice(0, 200);
    const markdown = String(input.markdown || "");
    if (!markdown.trim()) return json({ ok: false, error: "文档内容为空，暂时无法导出" }, 400);
    if (markdown.length > 50000) return json({ ok: false, error: "单次导出最多支持 50,000 个字符，请拆分后再导出" }, 413);

    const tokenResponse = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    });
    const tokenData = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || tokenData.code !== 0 || !tokenData.tenant_access_token) {
      throw new Error("无法取得飞书访问令牌，请检查应用凭据与应用状态");
    }
    const token = String(tokenData.tenant_access_token);

    const converted = await feishuRequest("/docx/v1/documents/blocks/convert", token, {
      content_type: "markdown",
      content: markdown,
    });
    const blocks = Array.isArray(converted.blocks) ? converted.blocks : [];
    const firstLevelBlockIds = Array.isArray(converted.first_level_block_ids) ? converted.first_level_block_ids : [];
    if (!blocks.length || !firstLevelBlockIds.length) {
      return json({ ok: false, error: "飞书没有从这段 Markdown 生成可写入的内容" }, 422);
    }
    if (blocks.length > 1000 || firstLevelBlockIds.length > 1000) {
      return json({ ok: false, error: "这篇内容生成的文档块过多，请拆分成较短的文档后再导出" }, 413);
    }
    removeReadOnlyMergeInfo(blocks);

    const created = await feishuRequest("/docx/v1/documents", token, { title });
    const document = created.document || {};
    const documentId = String(document.document_id || "");
    if (!documentId) throw new Error("飞书已响应，但没有返回文档编号");

    await feishuRequest(`/docx/v1/documents/${encodeURIComponent(documentId)}/blocks/${encodeURIComponent(documentId)}/descendant`, token, {
      children_id: firstLevelBlockIds,
      descendants: blocks,
      index: 0,
    });

    return json({
      ok: true,
      documentId,
      documentUrl: `https://feishu.cn/docx/${encodeURIComponent(documentId)}`,
      title,
    });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "飞书导出失败" }, 502);
  }
});
