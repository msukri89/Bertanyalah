import { mcpRequest } from "./turath-mcp-client.mjs";

const endpoint = process.env.TURATH_MCP_URL || "https://mcp.turath.io/mcp";
const protocolVersion = process.env.MCP_PROTOCOL_VERSION || "2025-06-18";

console.log("BERTANYALAH — Turath MCP connectivity test");
console.log("Endpoint:", endpoint);
console.log("Protocol:", protocolVersion);

const initialize = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion,
    capabilities: {},
    clientInfo: {
      name: "Bertanyalah",
      version: "0.1.0"
    }
  }
};

const init = await mcpRequest(endpoint, initialize, { protocolVersion });

console.log("\n[1] initialize");
console.log("HTTP:", init.status);
console.log("Session:", init.sessionId || "(none)");

if (!init.ok) {
  console.error("Initialize failed:", JSON.stringify(init.data, null, 2));
  process.exit(1);
}

const sessionId = init.sessionId || null;

const initialized = {
  jsonrpc: "2.0",
  method: "notifications/initialized",
  params: {}
};

const ready = await mcpRequest(endpoint, initialized, {
  protocolVersion,
  sessionId
});

console.log("\n[2] notifications/initialized");
console.log("HTTP:", ready.status);

const listTools = {
  jsonrpc: "2.0",
  id: 2,
  method: "tools/list",
  params: {}
};

const tools = await mcpRequest(endpoint, listTools, {
  protocolVersion,
  sessionId
});

console.log("\n[3] tools/list");
console.log("HTTP:", tools.status);

if (!tools.ok) {
  console.error("tools/list failed:", JSON.stringify(tools.data, null, 2));
  process.exit(1);
}

const toolList = tools.data?.result?.tools || [];
console.log("Jumlah tools:", toolList.length);

for (const tool of toolList) {
  console.log("\n---");
  console.log("Nama:", tool.name);
  console.log("Deskripsi:", tool.description || "(tidak ada)");
  console.log("Input schema:", JSON.stringify(tool.inputSchema || {}, null, 2));
}

const required = ["discover_turath", "search_turath", "get_book", "get_page", "get_author"];
const names = new Set(toolList.map(t => t.name));
const missing = required.filter(name => !names.has(name));

if (missing.length) {
  console.warn("\nPERINGATAN: tool yang belum ditemukan:", missing.join(", "));
  console.warn("Jangan lanjut membuat adapter berdasarkan asumsi nama tool.");
} else {
  console.log("\nSEMUA tool Turath yang dibutuhkan ditemukan.");
}
