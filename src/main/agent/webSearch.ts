/** DuckDuckGo HTML search adapter and deterministic result formatting. */
export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export async function searchWeb(
  query: string,
  options: { maxResults?: number; fetchImpl?: typeof fetch } = {}
): Promise<WebSearchResult[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxResults = Math.min(Math.max(options.maxResults ?? 5, 1), 8);
  const response = await fetchImpl(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: {
      "user-agent": "ArchAgent/0.2 (+https://local.agent)"
    }
  });
  if (!response.ok) {
    throw new Error(`web_search 请求失败：${response.status} ${response.statusText}`);
  }
  return parseDuckDuckGoHtml(await response.text()).slice(0, maxResults);
}

export function parseDuckDuckGoHtml(html: string): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  const blocks = html.match(/<div[^>]+class="[^"]*result[^"]*"[\s\S]*?(?=<div[^>]+class="[^"]*result[^"]*"|<\/body>|$)/gi) ?? [];
  for (const block of blocks) {
    const linkMatch =
      block.match(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i) ??
      block.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;
    const snippetMatch =
      block.match(/<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i) ??
      block.match(/<div[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const title = cleanHtmlText(linkMatch[2]);
    const url = normalizeDuckDuckGoUrl(decodeHtml(linkMatch[1]));
    const snippet = cleanHtmlText(snippetMatch?.[1] ?? "");
    if (title && url && !results.some((item) => item.url === url)) {
      results.push({ title, url, snippet });
    }
  }
  return results;
}

function cleanHtmlText(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

function normalizeDuckDuckGoUrl(rawUrl: string): string {
  if (rawUrl.startsWith("//")) return `https:${rawUrl}`;
  if (rawUrl.startsWith("/l/?")) {
    const match = rawUrl.match(/[?&]uddg=([^&]+)/);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  return rawUrl;
}

export function formatWebSearchResults(query: string, results: WebSearchResult[]): string {
  if (!results.length) return `No web search results for: ${query}`;
  return [
    `Web search results for: ${query}`,
    ...results.map((result, index) =>
      [`${index + 1}. ${result.title}`, `URL: ${result.url}`, result.snippet ? `摘要: ${result.snippet}` : ""]
        .filter(Boolean)
        .join("\n")
    )
  ].join("\n\n");
}
