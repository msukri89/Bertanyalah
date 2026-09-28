import assert from "node:assert/strict";
import { mcpRequest } from "./turath-mcp-client.mjs";

assert.equal(typeof mcpRequest, "function");

const controller = new AbortController();
controller.abort();

console.log("client module import: PASS");
console.log("basic assertion: PASS");
