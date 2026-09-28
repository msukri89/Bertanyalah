import { mcpRequest } from "./turath-mcp-client.mjs";

const ENDPOINT = process.env.TURATH_MCP_ENDPOINT || "https://mcp.turath.io/mcp";
const PROTOCOL = process.env.TURATH_MCP_PROTOCOL || "2025-06-18";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractToolText(data) {
  const content = data?.result?.content;
  if (!Array.isArray(content)) return [];
  return content
    .filter(item => item?.type === "text" && typeof item.text === "string")
    .map(item => item.text);
}

function parseToolPayload(data) {
  const texts = extractToolText(data);
  for (const text of texts) {
    try {
      return JSON.parse(text);
    } catch {}
  }
  return { texts };
}

async function request(body, sessionId = null) {
  const result = await mcpRequest(ENDPOINT, body, {
    protocolVersion: PROTOCOL,
    sessionId,
    timeoutMs: 30000
  });
  if (!result.ok) {
    throw new Error(`HTTP ${result.status}: ${JSON.stringify(result.data)}`);
  }
  if (result.data?.error) {
    throw new Error(`MCP error: ${JSON.stringify(result.data.error)}`);
  }
  return result;
}

console.log("BERTANYALAH — real Turath search test");
console.log("Query: بيع لحم الأضحية\n");

const init = await request({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: PROTOCOL,
    capabilities: {},
    clientInfo: { name: "bertanyalah-test", version: "0.1.0" }
  }
});

const sessionId = init.sessionId || null;
console.log(`initialize: HTTP ${init.status}, session ${sessionId || "(none)"}`);

await request({
  jsonrpc: "2.0",
  method: "notifications/initialized",
  params: {}
}, sessionId);

const search = await request({
  jsonrpc: "2.0",
  id: 2,
  method: "tools/call",
  params: {
    name: "search_turath",
    arguments: {
      q: "بيع لحم الأضحية",
      page: 1
    }
  }
}, sessionId);

const payload = parseToolPayload(search.data);
console.log("\nsearch_turath raw payload:");
console.log(JSON.stringify(payload, null, 2));

const hits = Array.isArray(payload?.hits)
  ? payload.hits
  : Array.isArray(payload?.results)
    ? payload.results
    : [];

console.log(`\nDetected hits: ${hits.length}`);

if (!hits.length) {
  console.log("Tidak ada hit terdeteksi dari payload.");
  process.exit(2);
}

const first = hits[0];
const meta = first?.meta || {};
console.log("\nFirst hit metadata:");
console.log(JSON.stringify(meta, null, 2));

const bookId = Number(meta.book_id ?? first.book_id);
const pageId = Number(meta.page_id);

assert(Number.isInteger(bookId), "book_id tidak ditemukan pada hit pertama.");
assert(Number.isInteger(pageId), "meta.page_id tidak ditemukan pada hit pertama.");

const page = await request({
  jsonrpc: "2.0",
  id: 3,
  method: "tools/call",
  params: {
    name: "get_page",
    arguments: { book_id: bookId, page_id: pageId }
  }
}, sessionId);

const pagePayload = parseToolPayload(page.data);

console.log("\nget_page payload:");
console.log(JSON.stringify(pagePayload, null, 2));

console.log("\nREAL TURATH SEARCH + PAGE RETRIEVAL: PASS");
