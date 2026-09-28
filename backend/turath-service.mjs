import { mcpRequest } from "./turath-mcp-client.mjs";

const ENDPOINT = process.env.TURATH_MCP_ENDPOINT || "https://mcp.turath.io/mcp";
const PROTOCOL = process.env.TURATH_MCP_PROTOCOL || "2025-06-18";

function unwrap(data) {
  const result = data?.result;
  if (!result) return null;
  if (result.structuredContent && typeof result.structuredContent === "object") {
    return result.structuredContent;
  }
  const texts = Array.isArray(result.content)
    ? result.content.filter(x => x?.type === "text" && typeof x.text === "string").map(x => x.text)
    : [];
  for (const text of texts) {
    try { return JSON.parse(text); } catch {}
  }
  return { texts };
}

async function callTool(name, args, sessionId) {
  const response = await mcpRequest(ENDPOINT, {
    jsonrpc: "2.0",
    id: Date.now() + Math.random(),
    method: "tools/call",
    params: { name, arguments: args }
  }, {
    protocolVersion: PROTOCOL,
    sessionId,
    timeoutMs: 30000
  });

  if (!response.ok) {
    const detail = response.error || `HTTP ${response.status}`;
    throw new Error(`Turath connection failed: ${detail}`);
  }
  if (response.data?.error) throw new Error(response.data.error.message || "Turath MCP protocol error");
  if (response.data?.result?.isError) {
    const message = (response.data.result.content || []).find(x => x?.type === "text")?.text || "Turath tool error";
    throw new Error(message);
  }
  return unwrap(response.data);
}

async function openSession() {
  const init = await mcpRequest(ENDPOINT, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: PROTOCOL,
      capabilities: {},
      clientInfo: { name: "bertanyalah", version: "0.1.0" }
    }
  }, { protocolVersion: PROTOCOL, timeoutMs: 30000 });

  if (!init.ok || init.data?.error) throw new Error("Gagal initialize Turath MCP.");
  const sessionId = init.sessionId || null;

  await mcpRequest(ENDPOINT, {
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {}
  }, { protocolVersion: PROTOCOL, sessionId, timeoutMs: 30000 });

  return sessionId;
}

function hitsFrom(payload) {
  if (Array.isArray(payload?.hits)) return payload.hits;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

export async function searchTurath(queries, { maxPages = 5 } = {}) {
  const sessionId = await openSession();
  const sourceMap = new Map();

  for (const query of [...new Set(queries)].slice(0, 4)) {
    const payload = await callTool("search_turath", { q: query, page: 1 }, sessionId);
    for (const hit of hitsFrom(payload).slice(0, maxPages)) {
      const meta = hit?.meta || {};
      const bookId = Number(meta.book_id ?? hit.book_id);
      const pageId = Number(meta.page_id ?? hit.page_id ?? hit.pageId);
      if (!Number.isInteger(bookId) || !Number.isInteger(pageId)) continue;
      const key = `${bookId}:${pageId}`;
      if (!sourceMap.has(key)) {
        sourceMap.set(key, {
          bookId,
          pageId,
          page: meta.page ?? null,
          volume: meta.vol ?? null,
          book: meta.book_name ?? null,
          author: meta.author_name ?? null,
          snippet: hit.text ?? hit.content ?? null
        });
      }
    }
  }

  const candidates = [...sourceMap.values()].slice(0, 8);
  const sources = [];

  for (const candidate of candidates) {
    const page = await callTool("get_page", {
      book_id: candidate.bookId,
      page_id: candidate.pageId
    }, sessionId);

    if (!page || typeof page !== "object") continue;

    const text = page.text ?? page.content ?? page.body ?? page.page_text ?? page.arabic_text ?? "";
    const link = typeof page.link === "string" && /^https?:\/\//i.test(page.link)
      ? page.link
      : `https://app.turath.io/book/${candidate.bookId}?page=${candidate.pageId}`;
    if (!text) continue;

    let bookMeta = null;
    try {
      const bookPayload = await callTool("get_book", {
        book_id: candidate.bookId,
        include_indexes: false
      }, sessionId);
      bookMeta = bookPayload?.data?.meta ?? bookPayload?.meta ?? null;
    } catch {}

    sources.push({
      id: `S${sources.length + 1}`,
      bookId: candidate.bookId,
      pageId: candidate.pageId,
      page: candidate.page ?? page?.meta?.page ?? null,
      volume: candidate.volume ?? page?.meta?.vol ?? null,
      book: bookMeta?.name ?? candidate.book ?? page?.meta?.book_name ?? null,
      author: candidate.author ?? page?.meta?.author_name ?? null,
      authorId: bookMeta?.author_id ?? null,
      text,
      link,
      bookInfo: bookMeta?.info ?? null
    });
  }

  return sources;
}
