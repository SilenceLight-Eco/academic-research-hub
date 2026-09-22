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
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const crossrefMailto = Deno.env.get("CROSSREF_MAILTO") || "";
const semanticScholarKey = Deno.env.get("SEMANTIC_SCHOLAR_API_KEY") || "";

type Subscription = {
  id: string;
  user_id: string;
  issn: string;
  journal_title: string;
  publisher: string;
  feed_url: string;
  enabled: boolean;
  last_checked_at: string | null;
};

type CrossrefWork = Record<string, unknown>;

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
    const message = payload && typeof payload === "object" && "message" in payload ? String(payload.message) : "数据库操作失败";
    throw new Error(message);
  }
  return payload;
}

function normalizeIssn(value: unknown): string {
  const match = String(value || "").toUpperCase().match(/\b(\d{4})-?(\d{3}[\dX])\b/);
  return match ? `${match[1]}-${match[2]}` : "";
}

function normalizeDoi(value: unknown): string {
  return String(value || "").trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").toLowerCase();
}

function plainText(value: unknown): string {
  return String(value || "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function dateFromParts(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const parts = (value as { "date-parts"?: unknown })["date-parts"];
  if (!Array.isArray(parts) || !Array.isArray(parts[0]) || !parts[0].length) return null;
  const [year, month = 1, day = 1] = parts[0].map(Number);
  if (!year) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function publicationDate(work: CrossrefWork): string | null {
  return dateFromParts(work["published-online"])
    || dateFromParts(work["published-print"])
    || dateFromParts(work.published)
    || dateFromParts(work.issued);
}

function authorNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") return "";
    const author = entry as Record<string, unknown>;
    const literal = plainText(author.name);
    if (literal) return literal;
    return [plainText(author.given), plainText(author.family)].filter(Boolean).join(" ");
  }).filter(Boolean).slice(0, 100);
}

async function crossref(path: string, params: Record<string, string> = {}) {
  const target = new URL(`https://api.crossref.org/${path.replace(/^\//, "")}`);
  Object.entries(params).forEach(([key, value]) => target.searchParams.set(key, value));
  if (crossrefMailto) target.searchParams.set("mailto", crossrefMailto);
  const response = await fetch(target, { headers: { "User-Agent": `AcademicResearchHub/1.0${crossrefMailto ? ` (mailto:${crossrefMailto})` : ""}` } });
  if (!response.ok) throw new Error(`Crossref 返回 ${response.status}`);
  const payload = await response.json();
  return payload && payload.message ? payload.message : payload;
}

function directChildText(node: Element, names: string[]): string {
  const match = Array.from(node.children).find((child) => names.includes(child.localName.toLowerCase()));
  return match ? String(match.textContent || "").trim() : "";
}

function feedItemLink(node: Element, isAtom: boolean): string {
  if (!isAtom) return directChildText(node, ["link"]);
  const link = Array.from(node.children).find((child) => child.localName.toLowerCase() === "link" && (!child.getAttribute("rel") || child.getAttribute("rel") === "alternate"));
  return link ? (link.getAttribute("href") || String(link.textContent || "").trim()) : "";
}

function feedAuthors(node: Element): string[] {
  const authors = Array.from(node.children).filter((child) => ["author", "creator"].includes(child.localName.toLowerCase()));
  return authors.map((author) => {
    const nestedName = directChildText(author, ["name"]);
    return plainText(nestedName || author.textContent);
  }).filter(Boolean).slice(0, 100);
}

function parseFeed(xml: string): Array<Record<string, unknown>> {
  if (xml.length > 2_000_000) throw new Error("RSS feed 超过 2 MB，已停止解析");
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (!document || document.querySelector("parsererror")) throw new Error("官网 RSS/Atom 格式无法解析");
  const rootName = document.documentElement.localName.toLowerCase();
  const isAtom = rootName === "feed";
  const nodes = Array.from(document.getElementsByTagName("*")).filter((node) =>
    node.localName.toLowerCase() === (isAtom ? "entry" : "item")
  );
  return nodes.slice(0, 40).map((node) => {
    const title = plainText(directChildText(node, ["title"]));
    const link = feedItemLink(node, isAtom);
    const summary = directChildText(node, ["summary", "description", "encoded", "content"]);
    const publishedRaw = directChildText(node, ["published", "updated", "pubdate", "date", "issued"]);
    const parsedDate = publishedRaw ? new Date(publishedRaw) : null;
    const publication_date = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString().slice(0, 10) : null;
    const categoryValues = Array.from(node.children)
      .filter((child) => child.localName.toLowerCase() === "category")
      .map((child) => plainText(child.getAttribute("term") || child.textContent))
      .filter(Boolean).slice(0, 12);
    const idOrGuid = directChildText(node, ["id", "guid"]);
    const doiMatch = `${link} ${idOrGuid} ${title}`.match(/10\.\d{4,9}\/[\-._;()/:A-Z0-9]+/i);
    return {
      title,
      link,
      abstract: plainText(summary),
      authors: feedAuthors(node),
      keywords: categoryValues,
      publication_date,
      doi: doiMatch ? normalizeDoi(doiMatch[0].replace(/[.,;)]+$/, "")) : "",
    };
  }).filter((item) => item.title);
}

function publicHttpsUrl(value: unknown): URL {
  let url: URL;
  try { url = new URL(String(value || "")); } catch { throw new Error("请填写有效的期刊官网 RSS/Atom 地址"); }
  const host = url.hostname.toLowerCase();
  const isIpLiteral = host.startsWith("[") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
  const blocked = isIpLiteral || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")
    || host === "metadata.google.internal" || host === "169.254.169.254"
    || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host === "::1" || host.startsWith("fc") || host.startsWith("fd");
  if (url.protocol !== "https:" || url.username || url.password || blocked) {
    throw new Error("RSS 地址必须是公开的 HTTPS 期刊网站链接");
  }
  return url;
}

async function fetchFeed(feedUrl: string): Promise<Array<Record<string, unknown>>> {
  const url = publicHttpsUrl(feedUrl);
  const response = await fetch(url, { headers: { Accept: "application/atom+xml, application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.5", "User-Agent": "AcademicResearchHub/1.0 (journal RSS reader)" }, redirect: "manual" });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) throw new Error("期刊 RSS 返回了无效跳转");
    const redirectUrl = new URL(location, url);
    publicHttpsUrl(redirectUrl.toString());
    const redirectResponse = await fetch(redirectUrl, { headers: { Accept: "application/atom+xml, application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.5", "User-Agent": "AcademicResearchHub/1.0 (journal RSS reader)" }, redirect: "manual" });
    if (!redirectResponse.ok) throw new Error(`期刊 RSS 返回 ${redirectResponse.status}`);
    return parseFeed(await readFeedBody(redirectResponse));
  }
  if (!response.ok) throw new Error(`期刊 RSS 返回 ${response.status}`);
  return parseFeed(await readFeedBody(response));
}

async function readFeedBody(response: Response): Promise<string> {
  const maximumBytes = 2_000_000;
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > maximumBytes) throw new Error("RSS feed 超过 2 MB，已停止读取");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new Error("RSS feed 超过 2 MB，已停止读取");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => { bytes.set(chunk, offset); offset += chunk.byteLength; });
  return new TextDecoder().decode(bytes);
}

async function semanticScholarByDois(dois: string[]) {
  const unique = Array.from(new Set(dois.filter(Boolean))).slice(0, 500);
  const result = new Map<string, Record<string, unknown>>();
  if (!unique.length) return result;
  const target = new URL("https://api.semanticscholar.org/graph/v1/paper/batch");
  target.searchParams.set("fields", "title,authors,abstract,publicationDate,venue,externalIds,s2FieldsOfStudy");
  const response = await fetch(target, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(semanticScholarKey ? { "x-api-key": semanticScholarKey } : {}) },
    body: JSON.stringify({ ids: unique.map((doi) => `DOI:${doi}`) }),
  });
  if (!response.ok) return result;
  const papers = await response.json().catch(() => []);
  if (!Array.isArray(papers)) return result;
  papers.forEach((paper: Record<string, unknown> | null) => {
    if (!paper || typeof paper !== "object") return;
    const externalIds = paper.externalIds && typeof paper.externalIds === "object" ? paper.externalIds as Record<string, unknown> : {};
    const doi = normalizeDoi(externalIds.DOI);
    if (doi) result.set(doi, paper);
  });
  return result;
}

async function crossrefWorksByDoi(dois: string[]) {
  const unique = Array.from(new Set(dois.filter(Boolean))).slice(0, 40);
  const result = new Map<string, CrossrefWork>();
  if (!unique.length) return result;
  const params: Record<string, string> = {
    rows: String(unique.length),
    select: "DOI,title,author,published,published-online,published-print,issued,URL,subject,type",
    filter: unique.map((doi) => `doi:${doi}`).join(","),
  };
  const message = await crossref("works", params).catch(() => null);
  const works = message && Array.isArray(message.items) ? message.items as CrossrefWork[] : [];
  works.forEach((work) => { const doi = normalizeDoi(work.DOI); if (doi) result.set(doi, work); });
  return result;
}

async function searchJournals(query: string) {
  const directIssn = normalizeIssn(query);
  if (directIssn) {
    const item = await crossref(`journals/${encodeURIComponent(directIssn)}`);
    return [{
      issn: directIssn,
      title: plainText(item.title) || directIssn,
      publisher: plainText(item.publisher),
    }];
  }
  const message = await crossref("journals", { query, rows: "8" });
  const items = Array.isArray(message.items) ? message.items : [];
  const seen = new Set<string>();
  return items.map((item: Record<string, unknown>) => {
    const issns = Array.isArray(item.ISSN) ? item.ISSN : [];
    const issn = normalizeIssn(issns[0] || item.issn || "");
    return { issn, title: plainText(item.title) || issn, publisher: plainText(item.publisher) };
  }).filter((item: { issn: string }) => item.issn && !seen.has(item.issn) && seen.add(item.issn));
}

async function listSubscriptions(userId?: string): Promise<Subscription[]> {
  const filter = userId ? `user_id=eq.${encodeURIComponent(userId)}&` : "";
  const rows = await rest(`journal_subscriptions?${filter}select=*&order=created_at.desc`);
  return Array.isArray(rows) ? rows as Subscription[] : [];
}

async function listForUser(userId: string) {
  const subscriptions = await listSubscriptions(userId);
  const articles = await rest(`journal_articles?user_id=eq.${encodeURIComponent(userId)}&select=*&order=publication_date.desc.nullslast,discovered_at.desc&limit=300`);
  return { subscriptions, articles: Array.isArray(articles) ? articles : [] };
}

async function refreshSubscription(subscription: Subscription) {
  const startedAt = new Date();
  const fallbackSince = new Date(startedAt.getTime() - 90 * 86400_000);
  const previous = subscription.last_checked_at ? new Date(subscription.last_checked_at) : fallbackSince;
  const safePrevious = Number.isNaN(previous.getTime()) ? fallbackSince : previous;
  const since = new Date(Math.min(safePrevious.getTime(), startedAt.getTime()) - 14 * 86400_000).toISOString().slice(0, 10);
  let fallbackNotice = "";
  try {
    let feedItems: Array<Record<string, unknown>> = [];
    let crossrefDiscovery: CrossrefWork[] = [];
    if (subscription.feed_url) {
      try {
        feedItems = await fetchFeed(subscription.feed_url);
      } catch (error) {
        fallbackNotice = `官网 RSS 读取失败，已使用 Crossref 后备：${error instanceof Error ? error.message : "读取失败"}`;
      }
    }
    if (!feedItems.length) {
      const message = await crossref(`journals/${encodeURIComponent(subscription.issn)}/works`, {
        filter: `from-pub-date:${since}`,
        sort: "published",
        order: "desc",
        rows: "40",
      });
      crossrefDiscovery = (Array.isArray(message.items) ? message.items : [])
        .filter((item: CrossrefWork) => !item.type || item.type === "journal-article")
        .slice(0, 40) as CrossrefWork[];
      feedItems = crossrefDiscovery.map((work) => ({
        title: plainText(Array.isArray(work.title) ? work.title[0] : work.title),
        link: plainText(work.URL),
        authors: authorNames(work.author),
        abstract: "",
        keywords: Array.isArray(work.subject) ? work.subject.map(plainText).filter(Boolean) : [],
        publication_date: publicationDate(work),
        doi: normalizeDoi(work.DOI),
      }));
    }

    const dois = feedItems.map((item) => normalizeDoi(item.doi)).filter(Boolean);
    const [semanticPapers, crossrefFallbacks] = await Promise.all([
      semanticScholarByDois(dois).catch(() => new Map<string, Record<string, unknown>>()),
      crossrefWorksByDoi(dois),
    ]);
    const rows = feedItems.map((item) => {
      const doi = normalizeDoi(item.doi);
      const semantic = doi ? semanticPapers.get(doi) : undefined;
      const fallback = doi ? crossrefFallbacks.get(doi) : undefined;
      const semanticAuthors = semantic && Array.isArray(semantic.authors)
        ? semantic.authors.map((author: Record<string, unknown>) => plainText(author.name)).filter(Boolean)
        : [];
      const rssAuthors = Array.isArray(item.authors) ? item.authors.map(plainText).filter(Boolean) : [];
      const fallbackAuthors = fallback ? authorNames(fallback.author) : [];
      const authors = rssAuthors.length ? rssAuthors : (semanticAuthors.length ? semanticAuthors : fallbackAuthors);
      const rssAbstract = plainText(item.abstract);
      const semanticAbstract = plainText(semantic && semantic.abstract);
      const abstract = rssAbstract || semanticAbstract;
      const rssKeywords = Array.isArray(item.keywords) ? item.keywords.map(plainText).filter(Boolean).slice(0, 12) : [];
      const crossrefSubjects = fallback && Array.isArray(fallback.subject) ? fallback.subject.map(plainText).filter(Boolean).slice(0, 12) : [];
      const semanticFields = semantic && Array.isArray(semantic.s2FieldsOfStudy)
        ? semantic.s2FieldsOfStudy.map((field: Record<string, unknown>) => plainText(field.category)).filter(Boolean).slice(0, 12)
        : [];
      const keywords = rssKeywords.length ? rssKeywords : (crossrefSubjects.length ? crossrefSubjects : semanticFields);
      const date = String(item.publication_date || (semantic && semantic.publicationDate) || publicationDate(fallback || {}) || "").slice(0, 10) || null;
      const title = plainText(item.title || (semantic && semantic.title) || (fallback && (Array.isArray(fallback.title) ? fallback.title[0] : fallback.title))) || "未命名文章";
      const url = plainText(item.link || (fallback && fallback.URL)) || (doi ? `https://doi.org/${doi}` : "");
      const sources = [];
      if (subscription.feed_url && !fallbackNotice && feedItems.length && !crossrefDiscovery.length) sources.push("期刊官网 RSS");
      if (crossrefDiscovery.length || fallbackNotice || !subscription.feed_url) sources.push("Crossref");
      if (semantic) sources.push("Semantic Scholar");
      if (fallback) sources.push("Crossref");
      const keywordSource = rssKeywords.length ? "期刊 RSS" : (crossrefSubjects.length ? "Crossref 主题词" : (semanticFields.length ? "Semantic Scholar 学科分类" : ""));
      return {
        subscription_id: subscription.id,
        user_id: subscription.user_id,
        article_key: doi || `${title.toLowerCase().replace(/\s+/g, " ").slice(0, 480)}|${date || "undated"}`,
        doi: doi || null,
        title,
        authors,
        abstract,
        abstract_source: rssAbstract ? "期刊官网 RSS" : (semanticAbstract ? "Semantic Scholar" : ""),
        keywords,
        keyword_source: keywordSource,
        publication_date: date,
        url,
        metadata_sources: Array.from(new Set(sources)),
        updated_at: startedAt.toISOString(),
      };
    });
    if (rows.length) {
      await rest("journal_articles?on_conflict=subscription_id,article_key", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(rows),
      });
    }
    await rest(`journal_subscriptions?id=eq.${encodeURIComponent(subscription.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ last_checked_at: startedAt.toISOString(), last_success_at: startedAt.toISOString(), last_error: fallbackNotice || null, updated_at: startedAt.toISOString() }),
    });
    return { id: subscription.id, ok: true, processed: rows.length, warning: fallbackNotice || undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : "抓取失败";
    await rest(`journal_subscriptions?id=eq.${encodeURIComponent(subscription.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ last_checked_at: startedAt.toISOString(), last_error: message.slice(0, 500), updated_at: startedAt.toISOString() }),
    }).catch(() => null);
    return { id: subscription.id, ok: false, error: message };
  }
}

async function authenticate(request: Request): Promise<string> {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization || !anonKey) throw new Error("请先登录工作台");
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: authorization } });
  if (!response.ok) throw new Error("登录状态已失效，请重新登录");
  const user = await response.json();
  if (!user || typeof user.id !== "string") throw new Error("无法识别当前账号");
  return user.id;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { ok: false, error: "仅支持 POST 请求" }, 405);
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins.has(origin)) return json(request, { ok: false, error: "来源地址不受支持" }, 403);
  if (!supabaseUrl || !serviceKey) return json(request, { ok: false, error: "文献追踪服务尚未完成配置" }, 503);

  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "list");
    if (action === "cron") {
      const configured = Deno.env.get("JOURNAL_TRACKER_CRON_SECRET") || "";
      if (!configured || request.headers.get("x-cron-secret") !== configured) return json(request, { ok: false, error: "定时任务凭证无效" }, 401);
      const subscriptions = (await listSubscriptions()).filter((item) => item.enabled).slice(0, 100);
      const results = [];
      for (const subscription of subscriptions) results.push(await refreshSubscription(subscription));
      return json(request, { ok: true, checked: results.length, results });
    }

    const userId = await authenticate(request);
    if (action === "search") {
      const query = String(body.query || "").trim();
      if (query.length < 2) return json(request, { ok: false, error: "请输入期刊名称或 ISSN" }, 400);
      return json(request, { ok: true, journals: await searchJournals(query) });
    }
    if (action === "add") {
      const issn = normalizeIssn(body.issn);
      if (!issn) return json(request, { ok: false, error: "ISSN 格式不正确" }, 400);
      const feedUrl = String(body.feedUrl || "").trim();
      if (feedUrl) {
        try { publicHttpsUrl(feedUrl); } catch (error) { return json(request, { ok: false, error: error instanceof Error ? error.message : "RSS 地址无效" }, 400); }
      }
      const journal = (await searchJournals(issn))[0];
      if (!journal) return json(request, { ok: false, error: "Crossref 中没有找到该期刊" }, 404);
      const existingRows = await rest(`journal_subscriptions?user_id=eq.${encodeURIComponent(userId)}&issn=eq.${encodeURIComponent(issn)}&select=feed_url`);
      const savedFeedUrl = feedUrl || (Array.isArray(existingRows) ? String(existingRows[0]?.feed_url || "") : "");
      const inserted = await rest("journal_subscriptions?on_conflict=user_id,issn", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({ user_id: userId, issn, journal_title: journal.title, publisher: journal.publisher, feed_url: savedFeedUrl, enabled: true, updated_at: new Date().toISOString() }),
      });
      const subscription = Array.isArray(inserted) ? inserted[0] as Subscription : null;
      if (subscription) await refreshSubscription(subscription);
      return json(request, { ok: true, ...(await listForUser(userId)) });
    }
    if (action === "set-feed") {
      const id = String(body.id || "");
      const feedUrl = String(body.feedUrl || "").trim();
      if (!id) return json(request, { ok: false, error: "缺少期刊订阅编号" }, 400);
      if (feedUrl) {
        try { publicHttpsUrl(feedUrl); } catch (error) { return json(request, { ok: false, error: error instanceof Error ? error.message : "RSS 地址无效" }, 400); }
      }
      const rows = await rest(`journal_subscriptions?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}&select=*`);
      const subscription = Array.isArray(rows) ? rows[0] as Subscription | undefined : undefined;
      if (!subscription) return json(request, { ok: false, error: "找不到该期刊订阅" }, 404);
      await rest(`journal_subscriptions?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ feed_url: feedUrl, updated_at: new Date().toISOString() }),
      });
      if (feedUrl) await refreshSubscription({ ...subscription, feed_url: feedUrl });
      return json(request, { ok: true, ...(await listForUser(userId)) });
    }
    if (action === "remove") {
      const id = String(body.id || "");
      await rest(`journal_subscriptions?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      return json(request, { ok: true, ...(await listForUser(userId)) });
    }
    if (action === "refresh") {
      const requestedId = String(body.id || "");
      const subscriptions = (await listSubscriptions(userId)).filter((item) => item.enabled && (!requestedId || item.id === requestedId));
      const results = [];
      for (const subscription of subscriptions) results.push(await refreshSubscription(subscription));
      return json(request, { ok: true, results, ...(await listForUser(userId)) });
    }
    return json(request, { ok: true, ...(await listForUser(userId)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "文献追踪服务暂时不可用";
    const status = /登录|账号/.test(message) ? 401 : 500;
    return json(request, { ok: false, error: message }, status);
  }
});
