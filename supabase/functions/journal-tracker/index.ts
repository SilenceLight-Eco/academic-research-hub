const allowedOrigins = new Set([
  "https://silencelight-eco.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://silencelight-eco.github.io",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret, x-retry-count, traceparent, tracestate, baggage",
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
  category: string;
  publisher: string;
  feed_url: string;
  enabled: boolean;
  last_checked_at: string | null;
  last_success_at?: string | null;
  last_error?: string | null;
};

type CrossrefWork = Record<string, unknown>;
type RefreshResult = { id: string; ok: boolean; processed?: number; error?: string; warning?: string; checked_at?: string };

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

async function manualJournalId(title: string): Promise<string> {
  const normalized = title.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  const suffix = Array.from(new Uint8Array(digest).slice(0, 10), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `MANUAL-${suffix}`;
}

function normalizeDoi(value: unknown): string {
  return String(value || "").trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").toLowerCase();
}

function normalizeTitle(value: unknown): string {
  return String(value || "").normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
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

function crossrefJournalCandidate(item: Record<string, unknown>): { issn: string; title: string; publisher: string } | null {
  const titles = Array.isArray(item["container-title"]) ? item["container-title"] as unknown[] : [];
  const title = plainText(titles[0] || item.title);
  const issns = Array.isArray(item.ISSN) ? item.ISSN as unknown[] : [];
  const issn = normalizeIssn(issns[0] || item.issn || "");
  if (!title || !issn) return null;
  return { issn, title, publisher: plainText(item.publisher) || "Crossref" };
}

async function crossrefWorksByTitle(title: string): Promise<CrossrefWork[]> {
  const message = await crossref("works", {
    "query.container-title": title,
    rows: "30",
    select: "DOI,title,author,abstract,container-title,ISSN,publisher,subject,type,published,published-online,published-print,issued,URL",
    sort: "published",
    order: "desc",
  });
  return (Array.isArray(message.items) ? message.items : []) as CrossrefWork[];
}

async function crossrefWorksByPaperTitle(title: string): Promise<CrossrefWork[]> {
  const message = await crossref("works", {
    "query.title": title,
    rows: "10",
    select: "DOI,title,author,abstract,container-title,subject,published,published-online,published-print,issued,URL",
    sort: "relevance",
  });
  return (Array.isArray(message.items) ? message.items : []) as CrossrefWork[];
}

async function semanticScholarRequest(endpoint: URL): Promise<Record<string, unknown>> {
  const response = await fetch(endpoint, {
    headers: { Accept: "application/json", ...(semanticScholarKey ? { "x-api-key": semanticScholarKey } : {}) },
    signal: AbortSignal.timeout(20000),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const message = response.status === 429
      ? "Semantic Scholar 请求过于频繁，请稍后重试"
      : `Semantic Scholar 返回 HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

async function fetchSemanticScholarPaper(doi: string, title: string): Promise<Record<string, unknown>> {
  const fields = "title,authors,abstract,year,venue,externalIds";
  let paper: Record<string, unknown> | null = null;
  let lastError: unknown = null;
  if (doi) {
    const endpoint = new URL(`https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}`);
    endpoint.searchParams.set("fields", fields);
    try { paper = await semanticScholarRequest(endpoint); } catch (error) { lastError = error; }
  }
  if (!paper && title) {
    const endpoint = new URL("https://api.semanticscholar.org/graph/v1/paper/search");
    endpoint.searchParams.set("query", title);
    endpoint.searchParams.set("limit", "10");
    endpoint.searchParams.set("fields", fields);
    try {
      const payload = await semanticScholarRequest(endpoint);
      const results = Array.isArray(payload.data) ? payload.data as Array<Record<string, unknown>> : [];
      paper = results.find((candidate) => normalizeTitle(candidate.title) === normalizeTitle(title)) || null;
      if (!paper && !lastError) lastError = new Error("Semantic Scholar 中没有标题完全匹配的记录");
    } catch (error) { lastError = error; }
  }
  if (!paper) throw lastError instanceof Error ? lastError : new Error("Semantic Scholar 没有找到匹配论文");
  return paper;
}

async function publishedSemanticScholarMetadata(doi: string, title: string) {
  let paper: Record<string, unknown> = {};
  let semanticError: unknown = null;
  try { paper = await fetchSemanticScholarPaper(doi, title); } catch (error) { semanticError = error; }
  const externalIds = paper.externalIds && typeof paper.externalIds === "object" ? paper.externalIds as Record<string, unknown> : {};
  const resolvedDoi = normalizeDoi(externalIds.DOI || doi);
  const [crossrefByDoi, openAlexByDoi] = resolvedDoi
    ? await Promise.all([
      crossrefWorksByDoi([resolvedDoi]).catch(() => new Map<string, CrossrefWork>()),
      openAlexWorksByDoi([resolvedDoi]).catch(() => new Map<string, Record<string, unknown>>()),
    ])
    : [new Map<string, CrossrefWork>(), new Map<string, Record<string, unknown>>()];
  let crossrefWork = resolvedDoi ? crossrefByDoi.get(resolvedDoi) : undefined;
  const openAlexWork = resolvedDoi ? openAlexByDoi.get(resolvedDoi) : undefined;
  if (!crossrefWork && title) {
    const candidates = await crossrefWorksByPaperTitle(title).catch(() => []);
    crossrefWork = candidates.find((candidate) => normalizeTitle(Array.isArray(candidate.title) ? candidate.title[0] : candidate.title) === normalizeTitle(title));
  }
  if (!Object.keys(paper).length && !crossrefWork) {
    throw semanticError instanceof Error ? semanticError : new Error("Semantic Scholar 与 Crossref 都没有找到匹配论文");
  }
  const semanticAuthors = Array.isArray(paper.authors)
    ? (paper.authors as Array<Record<string, unknown>>).map((author) => plainText(author.name)).filter(Boolean)
    : [];
  const publisherUrl = plainText(crossrefWork && crossrefWork.URL) || (resolvedDoi ? `https://doi.org/${resolvedDoi}` : "");
  const publisherMetadata = /^https:\/\//i.test(publisherUrl)
    ? await fetchArticlePageMetadata(publisherUrl)
    : { abstract: "", keywords: [] as string[] };
  const crossrefTitle = crossrefWork ? plainText(Array.isArray(crossrefWork.title) ? crossrefWork.title[0] : crossrefWork.title) : "";
  const crossrefAuthors = crossrefWork ? authorNames(crossrefWork.author) : [];
  const yearParts = crossrefWork ? publicationDate(crossrefWork) : null;
  return {
    title: plainText(paper.title) || crossrefTitle || title,
    authors: semanticAuthors.length ? semanticAuthors : crossrefAuthors,
    abstract: plainText(paper.abstract) || plainText(crossrefWork && crossrefWork.abstract)
      || reconstructOpenAlexAbstract(openAlexWork && openAlexWork.abstract_inverted_index)
      || publisherMetadata.abstract,
    journal: plainText(paper.venue) || plainText(crossrefWork && Array.isArray(crossrefWork["container-title"]) ? crossrefWork["container-title"][0] : ""),
    year: paper.year || (yearParts ? yearParts.slice(0, 4) : ""),
    doi: resolvedDoi,
    keywords: publisherMetadata.keywords,
    keywordSource: publisherMetadata.keywords.length ? "期刊网页（作者关键词）" : "",
    abstractSource: plainText(paper.abstract) ? "Semantic Scholar"
      : plainText(crossrefWork && crossrefWork.abstract) ? "Crossref"
      : reconstructOpenAlexAbstract(openAlexWork && openAlexWork.abstract_inverted_index) ? "OpenAlex"
      : publisherMetadata.abstract ? "期刊原文页" : "",
    metadataSource: Object.keys(paper).length ? "Semantic Scholar + OpenAlex + Crossref" : "OpenAlex + Crossref",
  };
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
    const idOrGuid = directChildText(node, ["id", "guid"]);
    const doiMatch = `${link} ${idOrGuid} ${title}`.match(/10\.\d{4,9}\/[\-._;()/:A-Z0-9]+/i);
    return {
      title,
      link,
      abstract: plainText(summary),
      authors: feedAuthors(node),
      // RSS/Atom categories are commonly classifications, not author keywords.
      keywords: [],
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

function splitPublisherKeywords(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((entry) => String(entry || "").split(/[,，;；|]/))
    .map((entry) => plainText(entry).replace(/^\[|\]$/g, "").trim())
    .filter((entry) => entry.length > 1 && entry.length <= 120)
    .slice(0, 30);
}

async function fetchArticlePageMetadata(value: unknown): Promise<{ abstract: string; keywords: string[] }> {
  let target = publicHttpsUrl(value);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(target, {
        headers: { Accept: "text/html,application/xhtml+xml;q=0.9", "User-Agent": "AcademicResearchHub/1.0 (metadata reader)" },
        redirect: "manual",
        signal: controller.signal,
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) return { abstract: "", keywords: [] };
        target = publicHttpsUrl(new URL(location, target).toString());
        continue;
      }
      if (!response.ok || !/^text\/html|application\/xhtml\+xml/i.test(response.headers.get("content-type") || "")) return { abstract: "", keywords: [] };
      const html = await readFeedBody(response);
      const document = new DOMParser().parseFromString(html, "text/html");
      const metaAbstract = (names: string[]) => {
        for (const name of names) {
          const meta = document.querySelector(`meta[name="${name}" i], meta[property="${name}" i]`);
          const content = plainText(meta?.getAttribute("content"));
          if (content.length >= 40) return content.slice(0, 20_000);
        }
        return "";
      };
      const jsonLdRecords = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).flatMap((script) => {
        try {
          const value = JSON.parse(script.textContent || "{}");
          const records: unknown[] = Array.isArray(value) ? value : [value];
          return records.flatMap((record: any) => record && Array.isArray(record["@graph"]) ? [record, ...record["@graph"]] : [record]);
        } catch { return []; }
      }).filter((record: any) => record && typeof record === "object");
      const jsonLd = jsonLdRecords.map((record: any) => plainText(record.abstract)).find((value) => value.length >= 40) || "";
      // Only use publisher metadata explicitly identified as author keywords.
      // Do not treat generic SEO keywords, Crossref subjects, or S2 fields of study as keywords.
      const citationKeywords = Array.from(document.querySelectorAll('meta[name="citation_keywords" i], meta[name="citation_keyword" i]'))
        .flatMap((meta) => splitPublisherKeywords(meta.getAttribute("content")));
      const schemaKeywords = jsonLdRecords.flatMap((record: any) => splitPublisherKeywords(record.keywords));
      const keywords = Array.from(new Set([...citationKeywords, ...schemaKeywords])).slice(0, 30);
      const abstractNode = document.querySelector('[id="abstract" i], [id="abstracts" i], [class*="abstract" i], [role="doc-abstract"]');
      const sectionAbstract = plainText(abstractNode?.textContent).replace(/^abstract\s*/i, "");
      const abstract = metaAbstract(["citation_abstract", "dc.description", "dc.abstract", "abstract"])
        || jsonLd
        || (sectionAbstract.length >= 40 ? sectionAbstract.slice(0, 20_000) : "")
        || metaAbstract(["description", "og:description"]);
      return { abstract, keywords };
    }
  } catch {
    return { abstract: "", keywords: [] };
  } finally {
    clearTimeout(timeout);
  }
  return { abstract: "", keywords: [] };
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
  const utf8Prefix = new TextDecoder().decode(bytes.slice(0, Math.min(bytes.length, 512)));
  const declaredEncoding = response.headers.get("content-type")?.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1]
    || utf8Prefix.match(/<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i)?.[1]
    || "utf-8";
  const normalizedEncoding = declaredEncoding.toLowerCase().replace(/^gb2312$/, "gbk").replace(/^windows-936$/, "gbk");
  try {
    return new TextDecoder(normalizedEncoding).decode(bytes);
  } catch {
    // A malformed/unsupported charset declaration should not prevent UTF-8 feeds from being read.
    return new TextDecoder("utf-8").decode(bytes);
  }
}

async function semanticScholarByDois(dois: string[]) {
  const unique = Array.from(new Set(dois.filter(Boolean))).slice(0, 500);
  const result = new Map<string, Record<string, unknown>>();
  if (!unique.length) return result;
  const target = new URL("https://api.semanticscholar.org/graph/v1/paper/batch");
  target.searchParams.set("fields", "title,authors,abstract,publicationDate,venue,externalIds");
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

function reconstructOpenAlexAbstract(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const words: string[] = [];
  Object.entries(value as Record<string, unknown>).forEach(([word, positions]) => {
    if (!Array.isArray(positions)) return;
    positions.forEach((position) => {
      const index = Number(position);
      if (Number.isInteger(index) && index >= 0 && index < 20_000) words[index] = word;
    });
  });
  return words.map((word) => word || "").join(" ").replace(/\s+/g, " ").trim();
}

async function openAlexWorksByDoi(dois: string[]) {
  const unique = Array.from(new Set(dois.filter(Boolean))).slice(0, 50);
  const result = new Map<string, Record<string, unknown>>();
  if (!unique.length) return result;
  const target = new URL("https://api.openalex.org/works");
  target.searchParams.set("filter", `doi:${unique.map((doi) => `https://doi.org/${doi}`).join("|")}`);
  target.searchParams.set("select", "doi,title,abstract_inverted_index,authorships,publication_year,primary_location,biblio,cited_by_count");
  target.searchParams.set("per_page", "50");
  const response = await fetch(target, { headers: { Accept: "application/json" } });
  if (!response.ok) return result;
  const payload = await response.json().catch(() => null);
  const works = payload && Array.isArray(payload.results) ? payload.results : [];
  works.forEach((work: Record<string, unknown>) => {
    const doi = normalizeDoi(work.doi);
    if (doi) result.set(doi, work);
  });
  return result;
}

async function crossrefWorksByDoi(dois: string[]) {
  const unique = Array.from(new Set(dois.filter(Boolean))).slice(0, 40);
  const result = new Map<string, CrossrefWork>();
  if (!unique.length) return result;
  const params: Record<string, string> = {
    rows: String(unique.length),
    select: "DOI,title,author,abstract,published,published-online,published-print,issued,URL,subject,type",
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
  const byIssn = new Map<string, { issn: string; title: string; publisher: string }>();
  try {
    const message = await crossref("journals", { query, rows: "8" });
    const items = Array.isArray(message.items) ? message.items as Array<Record<string, unknown>> : [];
    items.forEach((item) => {
      const issns = Array.isArray(item.ISSN) ? item.ISSN : [];
      const issn = normalizeIssn(issns[0] || item.issn || "");
      if (issn) byIssn.set(issn, { issn, title: plainText(item.title) || issn, publisher: plainText(item.publisher) });
    });
  } catch (_) {}
  // Some Chinese journals are absent from Crossref's journal directory but their
  // deposited articles still carry a journal title and ISSN in /works metadata.
  try {
    const works = await crossrefWorksByTitle(query);
    works.forEach((work) => {
      const candidate = crossrefJournalCandidate(work);
      if (candidate && !byIssn.has(candidate.issn)) byIssn.set(candidate.issn, candidate);
    });
  } catch (_) {}
  const normalizedQuery = normalizeTitle(query);
  const matches = Array.from(byIssn.values())
    .sort((left, right) => Number(normalizeTitle(right.title) === normalizedQuery) - Number(normalizeTitle(left.title) === normalizedQuery))
    .slice(0, 8);
  // Crossref's Chinese title search is especially fuzzy; never present a merely
  // similar Chinese journal as an exact identification.
  if (/\p{Script=Han}/u.test(query) && !matches.some((item) => normalizeTitle(item.title) === normalizedQuery)) return [];
  return matches;
}

async function listSubscriptions(userId?: string): Promise<Subscription[]> {
  const filter = userId ? `user_id=eq.${encodeURIComponent(userId)}&` : "";
  const rows = await rest(`journal_subscriptions?${filter}select=*&order=created_at.desc`);
  return Array.isArray(rows) ? rows as Subscription[] : [];
}

function subscriptionRefreshIntervalMs(subscription: Subscription, now = Date.now()): number {
  if (!subscription.last_error) return 24 * 60 * 60 * 1000;
  const lastSuccessAt = subscription.last_success_at ? Date.parse(subscription.last_success_at) : NaN;
  if (!Number.isFinite(lastSuccessAt)) return 15 * 60 * 1000;
  const failureAge = Math.max(0, now - lastSuccessAt);
  if (failureAge < 60 * 60 * 1000) return 10 * 60 * 1000;
  if (failureAge < 6 * 60 * 60 * 1000) return 30 * 60 * 1000;
  if (failureAge < 24 * 60 * 60 * 1000) return 2 * 60 * 60 * 1000;
  return 6 * 60 * 60 * 1000;
}

function subscriptionRefreshDue(subscription: Subscription, now = Date.now()): boolean {
  if (!subscription.enabled) return false;
  const lastCheckedAt = subscription.last_checked_at ? Date.parse(subscription.last_checked_at) : NaN;
  return !Number.isFinite(lastCheckedAt) || now - lastCheckedAt >= subscriptionRefreshIntervalMs(subscription, now);
}

async function purgeExpiredReadArticles(userId?: string) {
  const cutoff = new Date(Date.now() - 3 * 86400_000).toISOString();
  const userFilter = userId ? `user_id=eq.${encodeURIComponent(userId)}&` : "";
  const removed = await rest(`journal_articles?${userFilter}is_read=eq.true&read_at=lt.${encodeURIComponent(cutoff)}&select=id`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });
  return Array.isArray(removed) ? removed.length : 0;
}

async function purgeExpiredRefreshLogs() {
  const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString();
  await rest(`journal_tracker_refresh_logs?checked_at=lt.${encodeURIComponent(cutoff)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

async function countArticlesForUser(userId: string): Promise<number | null> {
  const response = await fetch(`${supabaseUrl}/rest/v1/journal_articles?user_id=eq.${encodeURIComponent(userId)}&select=id`, {
    method: "HEAD",
    headers: serviceHeaders({ Prefer: "count=exact", "Range-Unit": "items", Range: "0-0" }),
  });
  if (!response.ok) return null;
  const match = (response.headers.get("content-range") || "").match(/\/(\d+|\*)$/);
  return match && match[1] !== "*" ? Number(match[1]) : null;
}

async function listArticlesForUser(userId: string, expectedCount: number | null) {
  const pageSize = 1000;
  const rows: unknown[] = [];
  let offset = 0;
  while (expectedCount === null || offset < expectedCount) {
    const page = await rest(`journal_articles?user_id=eq.${encodeURIComponent(userId)}&select=*&order=publication_date.desc.nullslast,discovered_at.desc&limit=${pageSize}&offset=${offset}`);
    const batch = Array.isArray(page) ? page : [];
    if (!batch.length) break;
    rows.push(...batch);
    offset += batch.length;
    if (batch.length < pageSize) break;
  }
  return rows;
}

async function recordRefreshLogs(subscriptions: Subscription[], results: RefreshResult[], source: string) {
  const byId = new Map(subscriptions.map((subscription) => [subscription.id, subscription]));
  const rows = results.flatMap((result) => {
    const subscription = byId.get(result.id);
    if (!subscription || !result.checked_at) return [];
    return [{
      user_id: subscription.user_id,
      subscription_id: subscription.id,
      checked_at: result.checked_at,
      source,
      ok: result.ok,
      article_count: Math.max(0, Number(result.processed) || 0),
      error: result.error || result.warning || null,
    }];
  });
  if (!rows.length) return;
  await rest("journal_tracker_refresh_logs", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(rows),
  });
}

async function listForUser(userId: string) {
  await purgeExpiredReadArticles(userId);
  const [subscriptions, logs, articleCount] = await Promise.all([
    listSubscriptions(userId),
    rest(`journal_tracker_refresh_logs?user_id=eq.${encodeURIComponent(userId)}&select=*&order=checked_at.desc&limit=20`),
    countArticlesForUser(userId).catch(() => null),
  ]);
  const articles = await listArticlesForUser(userId, articleCount);
  const articleRows = Array.isArray(articles) ? articles : [];
  return { subscriptions, articles: articleRows, articleCount: articleCount === null ? articleRows.length : articleCount, refreshLogs: Array.isArray(logs) ? logs : [] };
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
        fallbackNotice = subscription.publisher === "手动 RSS"
          ? `官网 RSS 读取失败：${error instanceof Error ? error.message : "读取失败"}`
          : `官网 RSS 读取失败，已使用 Crossref 后备：${error instanceof Error ? error.message : "读取失败"}`;
      }
    }
    if (!feedItems.length && subscription.publisher === "手动 RSS") {
      if (fallbackNotice) throw new Error(`${fallbackNotice}；手动登记期刊没有 Crossref 后备，请检查 RSS 地址。`);
      if (!subscription.feed_url) throw new Error("手动登记的期刊需要有效的官网 RSS / Atom 地址才能追踪。");
    }
    if (!feedItems.length && subscription.publisher !== "手动 RSS") {
      const message = subscription.publisher === "按刊名检索"
        ? await crossref("works", {
          filter: `from-pub-date:${since},container-title:${subscription.journal_title}`,
          sort: "published",
          order: "desc",
          rows: "40",
        })
        : await crossref(`journals/${encodeURIComponent(subscription.issn)}/works`, {
        filter: `from-pub-date:${since}`,
        sort: "published",
        order: "desc",
        rows: "40",
      });
      crossrefDiscovery = (Array.isArray(message.items) ? message.items : [])
        .filter((item: CrossrefWork) => !item.type || item.type === "journal-article")
        .slice(0, 40) as CrossrefWork[];
      if (!crossrefDiscovery.length && subscription.publisher === "按刊名检索") {
        throw new Error(`Crossref 暂未找到「${subscription.journal_title}」的可追踪文章；请填写该刊官网 RSS / Atom 地址后重试。`);
      }
      feedItems = crossrefDiscovery.map((work) => ({
        title: plainText(Array.isArray(work.title) ? work.title[0] : work.title),
        link: plainText(work.URL),
        authors: authorNames(work.author),
        abstract: plainText(work.abstract),
        keywords: [],
        publication_date: publicationDate(work),
        doi: normalizeDoi(work.DOI),
      }));
    }

    const dois = feedItems.map((item) => normalizeDoi(item.doi)).filter(Boolean);
    const [semanticPapers, openAlexWorks, crossrefFallbacks] = await Promise.all([
      semanticScholarByDois(dois).catch(() => new Map<string, Record<string, unknown>>()),
      openAlexWorksByDoi(dois).catch(() => new Map<string, Record<string, unknown>>()),
      crossrefWorksByDoi(dois),
    ]);
    const pageMetadata = new Map<string, { abstract: string; keywords: string[] }>();
    const pageCandidates = feedItems.filter((item) => {
      // Fetch a small, bounded set of article pages so we can enrich abstracts
      // and retrieve publisher-declared author keywords (when exposed).
      return /^https:\/\//i.test(String(item.link || ""));
    }).slice(0, 12);
    for (let offset = 0; offset < pageCandidates.length; offset += 4) {
      const batch = pageCandidates.slice(offset, offset + 4);
      const metadata = await Promise.all(batch.map((item) => fetchArticlePageMetadata(item.link).catch(() => ({ abstract: "", keywords: [] }))));
      batch.forEach((item, index) => { pageMetadata.set(String(item.link), metadata[index]); });
    }
    const rows = feedItems.map((item) => {
      const doi = normalizeDoi(item.doi);
      const semantic = doi ? semanticPapers.get(doi) : undefined;
      const openAlex = doi ? openAlexWorks.get(doi) : undefined;
      const fallback = doi ? crossrefFallbacks.get(doi) : undefined;
      const semanticAuthors = semantic && Array.isArray(semantic.authors)
        ? semantic.authors.map((author: Record<string, unknown>) => plainText(author.name)).filter(Boolean)
        : [];
      const rssAuthors = Array.isArray(item.authors) ? item.authors.map(plainText).filter(Boolean) : [];
      const fallbackAuthors = fallback ? authorNames(fallback.author) : [];
      const authors = rssAuthors.length ? rssAuthors : (semanticAuthors.length ? semanticAuthors : fallbackAuthors);
      const rssAbstract = plainText(item.abstract);
      const semanticAbstract = plainText(semantic && semantic.abstract);
      const openAlexAbstract = reconstructOpenAlexAbstract(openAlex && openAlex.abstract_inverted_index);
      const crossrefAbstract = plainText(fallback && fallback.abstract);
      const page = pageMetadata.get(String(item.link || "")) || { abstract: "", keywords: [] };
      const pageAbstract = page.abstract;
      const abstract = rssAbstract || semanticAbstract || openAlexAbstract || crossrefAbstract || pageAbstract;
      const publisherKeywords = page.keywords;
      const keywords = publisherKeywords;
      const date = String(item.publication_date || (semantic && semantic.publicationDate) || publicationDate(fallback || {}) || "").slice(0, 10) || null;
      const title = plainText(item.title || (semantic && semantic.title) || (fallback && (Array.isArray(fallback.title) ? fallback.title[0] : fallback.title))) || "未命名文章";
      const url = plainText(item.link || (fallback && fallback.URL)) || (doi ? `https://doi.org/${doi}` : "");
      const sources = [];
      if (subscription.feed_url && !fallbackNotice && feedItems.length && !crossrefDiscovery.length) sources.push("期刊官网 RSS");
      if (crossrefDiscovery.length || fallbackNotice || !subscription.feed_url) sources.push("Crossref");
      if (semantic) sources.push("Semantic Scholar");
      if (openAlex) sources.push("OpenAlex");
      if (fallback) sources.push("Crossref");
      const keywordSource = publisherKeywords.length ? "期刊网页（作者关键词）" : "";
      return {
        subscription_id: subscription.id,
        user_id: subscription.user_id,
        article_key: doi || `${title.toLowerCase().replace(/\s+/g, " ").slice(0, 480)}|${date || "undated"}`,
        doi: doi || null,
        title,
        authors,
        abstract,
        abstract_source: rssAbstract ? "期刊官网 RSS" : (semanticAbstract ? "Semantic Scholar" : (openAlexAbstract ? "OpenAlex" : (crossrefAbstract ? "Crossref" : (pageAbstract ? "文章原文页面" : "")))),
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
    return { id: subscription.id, ok: true, processed: rows.length, warning: fallbackNotice || undefined, checked_at: startedAt.toISOString() };
  } catch (error) {
    const message = error instanceof Error ? error.message : "抓取失败";
    await rest(`journal_subscriptions?id=eq.${encodeURIComponent(subscription.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ last_checked_at: startedAt.toISOString(), last_error: message.slice(0, 500), updated_at: startedAt.toISOString() }),
    }).catch(() => null);
    return { id: subscription.id, ok: false, error: message, checked_at: startedAt.toISOString() };
  }
}

async function discoverPublishedFromJournal(feedUrl: string, journal: string) {
  const journalQuery = journal.trim();
  if (!journalQuery || journalQuery.length > 300) throw new Error("请填写期刊名称或 ISSN（不超过 300 个字符）");
  let feedItems: Array<Record<string, unknown>> = [];
  let feedWarning = "";
  if (feedUrl.trim()) {
    try { feedItems = await fetchFeed(feedUrl.trim()); }
    catch (error) { feedWarning = error instanceof Error ? error.message : "RSS/Atom 读取失败"; }
  }

  let discoverySource = "期刊官网 RSS / Atom";
  if (!feedItems.length) {
    discoverySource = "Crossref 后备";
    const issn = normalizeIssn(journalQuery);
    const message = issn
      ? await crossref(`journals/${encodeURIComponent(issn)}/works`, { sort: "published", order: "desc", rows: "40" })
      : await crossref("works", { "query.container-title": journalQuery, filter: "type:journal-article", sort: "published", order: "desc", rows: "40" });
    const works = (Array.isArray(message.items) ? message.items : []) as CrossrefWork[];
    feedItems = works.filter(work => !work.type || work.type === "journal-article").slice(0, 40).map(work => ({
      title: plainText(Array.isArray(work.title) ? work.title[0] : work.title),
      link: plainText(work.URL), authors: authorNames(work.author),
      abstract: plainText(work.abstract), keywords: [],
      publication_date: publicationDate(work), doi: normalizeDoi(work.DOI),
    })).filter(item => item.title);
  }
  if (!feedItems.length) throw new Error(feedWarning ? `官网 RSS/Atom 读取失败（${feedWarning}），Crossref 也没有找到文章。` : "该期刊的 RSS/Atom 与 Crossref 均未返回文章。");

  const dois = feedItems.map(item => normalizeDoi(item.doi)).filter(Boolean);
  const [semanticPapers, openAlexWorks, crossrefFallbacks] = await Promise.all([
    semanticScholarByDois(dois).catch(() => new Map<string, Record<string, unknown>>()),
    openAlexWorksByDoi(dois).catch(() => new Map<string, Record<string, unknown>>()),
    crossrefWorksByDoi(dois).catch(() => new Map<string, CrossrefWork>()),
  ]);
  const articles = feedItems.map(item => {
    const doi = normalizeDoi(item.doi);
    const semantic = doi ? semanticPapers.get(doi) : undefined;
    const openAlex = doi ? openAlexWorks.get(doi) : undefined;
    const fallback = doi ? crossrefFallbacks.get(doi) : undefined;
    const semanticAuthors = semantic && Array.isArray(semantic.authors) ? semantic.authors.map((author: Record<string, unknown>) => plainText(author.name)).filter(Boolean) : [];
    const openAlexAuthors = openAlex && Array.isArray(openAlex.authorships) ? openAlex.authorships.map((authorship: Record<string, unknown>) => {
      const author = authorship.author && typeof authorship.author === "object" ? authorship.author as Record<string, unknown> : {};
      return plainText(author.display_name);
    }).filter(Boolean) : [];
    const rssAuthors = Array.isArray(item.authors) ? item.authors.map(plainText).filter(Boolean) : [];
    const rssAbstract = plainText(item.abstract);
    const semanticAbstract = plainText(semantic && semantic.abstract);
    const openAlexAbstract = reconstructOpenAlexAbstract(openAlex && openAlex.abstract_inverted_index);
    const crossrefAbstract = plainText(fallback && fallback.abstract);
    const sources = [discoverySource];
    if (semantic) sources.push("Semantic Scholar");
    if (openAlex) sources.push("OpenAlex");
    if (fallback) sources.push("Crossref");
    return {
      title: plainText(item.title || (semantic && semantic.title) || (fallback && (Array.isArray(fallback.title) ? fallback.title[0] : fallback.title))) || "未命名文章",
      authors: rssAuthors.length ? rssAuthors : (semanticAuthors.length ? semanticAuthors : (openAlexAuthors.length ? openAlexAuthors : authorNames(fallback && fallback.author))),
      abstract: rssAbstract || semanticAbstract || openAlexAbstract || crossrefAbstract,
      journal: plainText((Array.isArray(fallback && fallback["container-title"]) ? fallback["container-title"][0] : "") || journalQuery),
      year: String(item.publication_date || publicationDate(fallback || {}) || "").slice(0, 4),
      volume: plainText(fallback && fallback.volume), issue: plainText(fallback && fallback.issue), pages: plainText(fallback && fallback.page),
      doi: doi || null, url: plainText(item.link || (fallback && fallback.URL)) || (doi ? `https://doi.org/${doi}` : ""),
      keywords: [],
      citations: Number(fallback && fallback["is-referenced-by-count"]) || 0,
      metadata_sources: Array.from(new Set(sources)),
      discovery_source: discoverySource,
    };
  });
  return { articles, discoverySource, warning: feedWarning || undefined };
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

function rankValue(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (Array.isArray(value)) return value.map(rankValue).filter(Boolean).join(" / ") || null;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const preferred = record.rank ?? record.value ?? record.zone ?? record.quartile ?? record.name;
    return preferred === undefined ? null : rankValue(preferred);
  }
  return plainText(value).slice(0, 100) || null;
}

async function queryEasyScholarRank(secretKey: string, publicationName: string): Promise<Record<string, string>> {
  const key = secretKey.trim();
  const name = publicationName.trim();
  if (key.length < 8 || key.length > 500) throw new Error("EasyScholar Secret Key 格式无效");
  if (!name || name.length > 300) throw new Error("请提供有效的期刊名称或 ISSN");
  const endpoint = new URL("https://www.easyscholar.cc/open/getPublicationRank");
  endpoint.searchParams.set("secretKey", key);
  endpoint.searchParams.set("publicationName", name);
  const response = await fetch(endpoint, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
  const result = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(`EasyScholar 请求失败（HTTP ${response.status}）`);
  if (Number(result.code) !== 200) {
    const message = plainText(result.message || result.msg || "");
    throw new Error(message ? `EasyScholar：${message.slice(0, 180)}` : `EasyScholar 未成功返回数据（状态 ${String(result.code || "未知")}）`);
  }
  const data = result.data && typeof result.data === "object" ? result.data as Record<string, unknown> : {};
  const officialRank = data.officialRank && typeof data.officialRank === "object" ? data.officialRank as Record<string, unknown> : {};
  const all = officialRank.all && typeof officialRank.all === "object" ? officialRank.all as Record<string, unknown> : officialRank;
  const selected = officialRank.select && typeof officialRank.select === "object" ? officialRank.select as Record<string, unknown> : {};
  const keys = ["sci", "ssci", "sciUp", "sciBase", "sciUpSmall", "sciUpTop", "jci", "sciif", "sciif5", "esiwarn", "sciwarn", "jcr"];
  const rank: Record<string, string> = {};
  for (const keyName of keys) {
    const value = rankValue(selected[keyName] ?? all[keyName] ?? data[keyName]);
    if (value) rank[keyName] = value;
  }
  if (!Object.keys(rank).length) throw new Error("EasyScholar 已找到记录，但响应中没有可识别的分区字段");
  return rank;
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
      const cleaned = await purgeExpiredReadArticles();
      await purgeExpiredRefreshLogs();
      const subscriptions = (await listSubscriptions()).filter((item) => subscriptionRefreshDue(item)).slice(0, 100);
      const results: RefreshResult[] = [];
      for (const subscription of subscriptions) results.push(await refreshSubscription(subscription));
      await recordRefreshLogs(subscriptions, results, "scheduled");
      return json(request, { ok: true, checked: results.length, cleanedReadArticles: cleaned, results });
    }

    const userId = await authenticate(request);
    if (action === "count") {
      const articleCount = await countArticlesForUser(userId);
      if (articleCount === null) return json(request, { ok: false, error: "暂时无法统计已收录文章数量" }, 503);
      return json(request, { ok: true, articleCount });
    }
    if (action === "easyScholar-rank") {
      const secretKey = String(body.secretKey || "");
      const publicationName = String(body.publicationName || "");
      const rank = await queryEasyScholarRank(secretKey, publicationName);
      return json(request, { ok: true, rank, source: "EasyScholar Open API", easyScholarVersion: 1, publicationName: publicationName.slice(0, 300), queriedAt: new Date().toISOString() });
    }
    if (action === "discover-published") {
      const feedUrl = String(body.feedUrl || "");
      const journal = String(body.journal || "");
      return json(request, { ok: true, ...(await discoverPublishedFromJournal(feedUrl, journal)) });
    }
    if (action === "semantic-scholar-metadata") {
      const doi = normalizeDoi(body.doi);
      const title = String(body.title || "").trim().slice(0, 500);
      if ((!doi || doi.includes("xxxx")) && title.length < 3) {
        return json(request, { ok: false, error: "请提供有效 DOI 或论文标题" }, 400);
      }
      const metadata = await publishedSemanticScholarMetadata(doi && !doi.includes("xxxx") ? doi : "", title);
      return json(request, { ok: true, metadata, source: "Semantic Scholar + Crossref" });
    }
    if (action === "set-read") {
      const id = String(body.id || "");
      if (!id) return json(request, { ok: false, error: "缺少文章编号" }, 400);
      const isRead = body.isRead === true;
      const updatedAt = new Date().toISOString();
      const updated = await rest(`journal_articles?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}&select=id,is_read`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ is_read: isRead, read_at: isRead ? updatedAt : null, updated_at: updatedAt }),
      });
      if (!Array.isArray(updated) || updated.length === 0) return json(request, { ok: false, error: "找不到这篇追踪文章" }, 404);
      if (updated[0].is_read !== isRead) throw new Error("数据库未能确认阅读状态变更");
      return json(request, { ok: true, ...(await listForUser(userId)), readStateVersion: 1 });
    }
    if (action === "mark-selected-read") {
      const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map((value: unknown) => String(value || "")))] : [];
      if (!ids.length || ids.length > 300 || ids.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
        return json(request, { ok: false, error: "请重新筛选未读文章后再操作" }, 400);
      }
      const updatedRows: unknown[] = [];
      const updatedAt = new Date().toISOString();
      for (let index = 0; index < ids.length; index += 100) {
        const chunk = ids.slice(index, index + 100);
        const path = "journal_articles?id=in.(" + chunk.join(",") + ")&user_id=eq." + encodeURIComponent(userId) + "&or=(is_read.eq.false,is_read.is.null)&select=id,is_read";
        const updated = await rest(path, {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ is_read: true, read_at: updatedAt, updated_at: updatedAt }),
        });
        if (Array.isArray(updated)) updatedRows.push(...updated);
      }
      const data = await listForUser(userId);
      const selectedStillUnread = data.articles.some((article: Record<string, unknown>) => ids.includes(String(article.id)) && article.is_read !== true);
      if (selectedStillUnread) throw new Error("部分筛选文章未能更新为已读");
      return json(request, { ok: true, ...data, readStateVersion: 1, updatedCount: updatedRows.length });
    }
    if (action === "mark-all-read") {
      const updatedAt = new Date().toISOString();
      const updated = await rest(`journal_articles?user_id=eq.${encodeURIComponent(userId)}&or=(is_read.eq.false,is_read.is.null)&select=id,is_read`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ is_read: true, read_at: updatedAt, updated_at: updatedAt }),
      });
      const data = await listForUser(userId);
      if (data.articles.some((article: Record<string, unknown>) => article.is_read !== true)) throw new Error("部分文章未能更新为已读");
      return json(request, { ok: true, ...data, readStateVersion: 1, updatedCount: Array.isArray(updated) ? updated.length : 0 });
    }
    if (action === "search") {
      const query = String(body.query || "").trim();
      if (query.length < 2) return json(request, { ok: false, error: "请输入期刊名称或 ISSN" }, 400);
      return json(request, { ok: true, journals: await searchJournals(query) });
    }
    if (action === "add") {
      const query = String(body.query || body.issn || "").trim();
      if (query.length < 2) return json(request, { ok: false, error: "请输入期刊全名或 ISSN" }, 400);
      if (query.length > 300) return json(request, { ok: false, error: "期刊名称最多 300 个字符" }, 400);
      const suppliedIssn = String(body.issn || "").trim();
      const requestedIssn = normalizeIssn(suppliedIssn || query);
      if (suppliedIssn && !requestedIssn) return json(request, { ok: false, error: "ISSN 格式无效，请使用 1234-567X 格式" }, 400);
      const feedUrl = String(body.feedUrl || "").trim();
      if (feedUrl) {
        try { publicHttpsUrl(feedUrl); } catch (error) { return json(request, { ok: false, error: error instanceof Error ? error.message : "RSS 地址无效" }, 400); }
      }
      let candidates: Array<{ issn: string; title: string; publisher: string }> = [];
      let crossrefError: unknown = null;
      try { candidates = await searchJournals(requestedIssn || query); }
      catch (error) { crossrefError = error; }
      const normalizedQuery = normalizeTitle(query);
      const exact = candidates.filter((item) => normalizeTitle(item.title) === normalizedQuery);
      let journal = requestedIssn ? candidates[0] : exact[0] || null;
      if (!requestedIssn && exact.length > 1 && !feedUrl) {
        return json(request, { ok: false, error: "找到多个刊名完全相同的期刊，请在候选列表中选择准确的刊名和 ISSN" }, 409);
      }
      if (!journal && candidates.length && !feedUrl) {
        return json(request, { ok: false, error: "找到相近期刊，请在候选列表中选择准确的刊名和 ISSN" }, 409);
      }
      if (!journal) {
        const chineseTitle = /\p{Script=Han}/u.test(query);
        if (!feedUrl && !chineseTitle) {
          if (crossrefError) throw crossrefError;
          return json(request, { ok: false, error: "Crossref 中没有找到该期刊。中文期刊可直接按刊名追踪；若 Crossref 也没有该刊文章，请补充官网 RSS / Atom 地址。" }, 404);
        }
        journal = {
          issn: requestedIssn || await manualJournalId(query),
          title: query,
          publisher: chineseTitle && !requestedIssn ? "按刊名检索" : (feedUrl ? "手动 RSS" : "按刊名检索"),
        };
      }
      const issn = journal.issn;
      const existingRows = await rest(`journal_subscriptions?user_id=eq.${encodeURIComponent(userId)}&issn=eq.${encodeURIComponent(issn)}&select=feed_url`);
      const savedFeedUrl = feedUrl || (Array.isArray(existingRows) ? String(existingRows[0]?.feed_url || "") : "");
      const category = typeof body.category === "string"
        ? body.category.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 60)
        : undefined;
      if (category === "__default__" || category === "__new_category__" || category === "未分类") {
        return json(request, { ok: false, error: "期刊分类名称无效" }, 400);
      }
      const subscriptionPayload: Record<string, unknown> = {
        user_id: userId,
        issn,
        journal_title: journal.title,
        publisher: journal.publisher,
        feed_url: savedFeedUrl,
        enabled: true,
        updated_at: new Date().toISOString(),
      };
      if (category !== undefined) subscriptionPayload.category = category;
      const inserted = await rest("journal_subscriptions?on_conflict=user_id,issn", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(subscriptionPayload),
      });
      const subscription = Array.isArray(inserted) ? inserted[0] as Subscription : null;
      const firstRefresh = subscription ? await refreshSubscription(subscription) : null;
      return json(request, {
        ok: true,
        ...(await listForUser(userId)),
        warning: firstRefresh && !firstRefresh.ok ? firstRefresh.error : undefined,
      });
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
    if (action === "set-category") {
      const id = String(body.id || "");
      const category = String(body.category || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 60);
      if (!id) return json(request, { ok: false, error: "缺少期刊订阅编号" }, 400);
      const updated = await rest(`journal_subscriptions?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}&select=id`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ category, updated_at: new Date().toISOString() }),
      });
      if (!Array.isArray(updated) || updated.length === 0) return json(request, { ok: false, error: "找不到该期刊订阅" }, 404);
      return json(request, { ok: true, ...(await listForUser(userId)) });
    }
    if (action === "set-categories") {
      const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map((value: unknown) => String(value || "")))].slice(0, 200) : [];
      const category = String(body.category || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 60);
      if (!ids.length || ids.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
        return json(request, { ok: false, error: "请选择有效的期刊" }, 400);
      }
      await rest("journal_subscriptions?id=in.(" + ids.join(",") + ")&user_id=eq." + encodeURIComponent(userId), {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ category, updated_at: new Date().toISOString() }),
      });
      return json(request, { ok: true, ...(await listForUser(userId)) });
    }
    if (action === "rename-category") {
      const from = String(body.from || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 60);
      const to = String(body.to || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 60);
      if (!from || from === "未分类" || !to || to === "未分类") return json(request, { ok: false, error: "分类名称无效" }, 400);
      const updated = await rest("journal_subscriptions?category=eq." + encodeURIComponent(from) + "&user_id=eq." + encodeURIComponent(userId) + "&select=id", {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ category: to, updated_at: new Date().toISOString() }),
      });
      if (!Array.isArray(updated) || updated.length === 0) return json(request, { ok: false, error: "找不到该分类中的期刊" }, 404);
      return json(request, { ok: true, ...(await listForUser(userId)) });
    }
    if (action === "delete-category") {
      const category = String(body.category || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 60);
      if (!category || category === "未分类") return json(request, { ok: false, error: "不能删除该分类" }, 400);
      await rest("journal_subscriptions?category=eq." + encodeURIComponent(category) + "&user_id=eq." + encodeURIComponent(userId), {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ category: "", updated_at: new Date().toISOString() }),
      });
      return json(request, { ok: true, ...(await listForUser(userId)) });
    }
    if (action === "remove") {
      const id = String(body.id || "");
      await rest(`journal_subscriptions?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      return json(request, { ok: true, ...(await listForUser(userId)) });
    }
    if (action === "refresh-category") {
      const category = String(body.category || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 60);
      if (!category || category === "all" || category === "__new_category__") {
        return json(request, { ok: false, error: "请先选择有效的期刊分类" }, 400);
      }
      const subscriptions = (await listSubscriptions(userId)).filter((item) =>
        item.enabled && ((String(item.category || "").trim() || "未分类") === category)
      );
      if (!subscriptions.length) return json(request, { ok: false, error: "该分类没有启用中的期刊" }, 404);
      const results: RefreshResult[] = [];
      for (const subscription of subscriptions) results.push(await refreshSubscription(subscription));
      await recordRefreshLogs(subscriptions, results, "category");
      return json(request, { ok: true, category, results, ...(await listForUser(userId)) });
    }
    if (action === "retry-failed") {
      const category = String(body.category || "all").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 60) || "all";
      const journalId = String(body.journalId || "").trim();
      if (category === "__new_category__") return json(request, { ok: false, error: "无效的期刊分类" }, 400);
      if (journalId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(journalId)) {
        return json(request, { ok: false, error: "无效的期刊标识" }, 400);
      }
      const subscriptions = (await listSubscriptions(userId)).filter((item) =>
        item.enabled && Boolean(item.last_error) &&
        (!journalId || item.id === journalId) &&
        (category === "all" || ((String(item.category || "").trim() || "未分类") === category))
      );
      const results: RefreshResult[] = [];
      for (const subscription of subscriptions) results.push(await refreshSubscription(subscription));
      await recordRefreshLogs(subscriptions, results, "retry");
      return json(request, { ok: true, category, journalId: journalId || null, results, ...(await listForUser(userId)) });
    }
    if (action === "refresh-due") {
      const subscriptions = (await listSubscriptions(userId)).filter((item) => subscriptionRefreshDue(item)).slice(0, 100);
      const results: RefreshResult[] = [];
      for (const subscription of subscriptions) results.push(await refreshSubscription(subscription));
      await recordRefreshLogs(subscriptions, results, "automatic");
      return json(request, { ok: true, results, ...(await listForUser(userId)) });
    }
    if (action === "refresh") {
      const requestedId = String(body.id || "");
      const subscriptions = (await listSubscriptions(userId)).filter((item) => item.enabled && (!requestedId || item.id === requestedId));
      const results: RefreshResult[] = [];
      for (const subscription of subscriptions) results.push(await refreshSubscription(subscription));
      await recordRefreshLogs(subscriptions, results, "manual");
      return json(request, { ok: true, results, ...(await listForUser(userId)) });
    }
    return json(request, { ok: true, ...(await listForUser(userId)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "文献追踪服务暂时不可用";
    const status = /登录|账号/.test(message) ? 401 : 500;
    return json(request, { ok: false, error: message }, status);
  }
});
