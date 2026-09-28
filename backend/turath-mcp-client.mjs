const DEFAULT_PROTOCOL_VERSION = "2025-06-18";

export async function mcpRequest(endpoint, body, {
  protocolVersion = DEFAULT_PROTOCOL_VERSION,
  sessionId = null,
  timeoutMs = 30000
} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "MCP-Protocol-Version": protocolVersion
    };

    if (sessionId) headers["Mcp-Session-Id"] = sessionId;

    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (error) {
      return {
        ok: false,
        status: 0,
        contentType: null,
        sessionId: null,
        error: error instanceof Error ? error.message : String(error)
      };
    }

    const text = await response.text();

    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type"),
      sessionId: response.headers.get("mcp-session-id"),
      data
    };
  } finally {
    clearTimeout(timer);
  }
}
