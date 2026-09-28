import assert from "node:assert/strict";
import { mcpRequest } from "./turath-mcp-client.mjs";

assert.equal(typeof mcpRequest, "function");

const invalid = await mcpRequest("https://127.0.0.1:1/unreachable", {
  jsonrpc: "2.0", id: 1, method: "ping"
}, { timeoutMs: 500 });

assert.equal(invalid.ok, false);
console.log("client import: PASS");
console.log("network failure handling: PASS");
