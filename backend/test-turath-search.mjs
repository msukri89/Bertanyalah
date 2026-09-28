import { mcpRequest } from "./turath-mcp-client.mjs";

const ENDPOINT = process.env.TURATH_MCP_ENDPOINT || "https://mcp.turath.io/mcp";
const PROTOCOL = process.env.TURATH_MCP_PROTOCOL || "2025-06-18";

function fail(message, details = null) {
  console.error(`FAIL: ${message}`);
  if (details) console.error(JSON.stringify(details, null, 2));
  process.exit(1);
}

function extractToolResult(data) {
  const result = data?.result;
  if (!result) return null;

  if (result.structuredContent && typeof result.structuredContent === "object") {
    return result.structuredContent;
  }

  const texts = Array.isArray(result.content)
    ? result.content
        .filter(item => item?.type === "text" && typeof item.text === "string")
        .map(item => item.text)
    : [];

  for (const t of texts) {
    try { return JSON.parse(t); } catch {}
  }

  return { texts };
}

async function request(body, sessionId = null) {
  const r = await mcpRequest(ENDPOINT, body, {
    protocolVersion: PROTOCOL,
    sessionId,
    timeoutMs: 30000
  });

  if (!r.ok) fail(`HTTP ${r.status}`, r.data);
  if (r.data?.error) fail("MCP JSON-RPC error", r.data.error);
  return r;
}

function pickHits(payload) {
  if (Array.isArray(payload?.hits)) return payload.hits;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

console.log("BERTANYALAH — Turath evidence pipeline test");
console.log("Endpoint:", ENDPOINT);
console.log("Query: بيع لحم الأضحية");

const init = await request({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: PROTOCOL,
    capabilities: {},
    clientInfo: { name: "bertanyalah-test", version: "0.2.0" }
  }
});

const sessionId = init.sessionId || null;
console.log("initialize: PASS");

await request({
  jsonrpc: "2.0",
  method: "notifications/initialized",
  params: {}
}, sessionId);

const searchResponse = await request({
  jsonrpc: "2.0",
  id: 2,
  method: "tools/call",
  params: {
    name: "search_turath",
    arguments: { q: "بيع لحم الأضحية", page: 1 }
  }
}, sessionId);

const searchPayload = extractToolResult(searchResponse.data);
const hits = pickHits(searchPayload);

if (!hits.length) fail("search_turath tidak mengembalikan hit.", searchPayload);

const first = hits[0];
const meta = first?.meta || {};
const bookId = Number(meta.book_id ?? first.book_id);
const pageId = Number(meta.page_id);

if (!Number.isInteger(bookId)) fail("book_id tidak ditemukan.", first);
if (!Number.isInteger(pageId)) fail("meta.page_id tidak ditemukan.", first);

console.log("search_turath: PASS");
console.log("First hit:", JSON.stringify({
  book_id: bookId,
  page_id: pageId,
  meta
}, null, 2));

const pageResponse = await request({
  jsonrpc: "2.0",
  id: 3,
  method: "tools/call",
  params: {
    name: "get_page",
    arguments: { book_id: bookId, page_id: pageId }
  }
}, sessionId);

const pagePayload = extractToolResult(pageResponse.data);

if (!pagePayload || typeof pagePayload !== "object") {
  fail("get_page mengembalikan payload yang tidak valid.", pagePayload);
}

const pageText =
  pagePayload.text ??
  pagePayload.content ??
  pagePayload.body ??
  pagePayload.page_text ??
  pagePayload.arabic_text ??
  null;

if (!pageText && !JSON.stringify(pagePayload).match(/[\u0600-\u06ff]/)) {
  fail("get_page tidak memberikan teks Turath yang dapat dikenali.", pagePayload);
}

console.log("get_page: PASS");
console.log("Page payload keys:", Object.keys(pagePayload));
console.log("Page text detected:", Boolean(pageText));

const bookResponse = await request({
  jsonrpc: "2.0",
  id: 4,
  method: "tools/call",
  params: {
    name: "get_book",
    arguments: { book_id: bookId, include_indexes: false }
  }
}, sessionId);

const bookPayload = extractToolResult(bookResponse.data);
console.log("get_book: PASS");
console.log("Book payload keys:", bookPayload && typeof bookPayload === "object" ? Object.keys(bookPayload) : []);

console.log("\nEVIDENCE PIPELINE: PASS");
