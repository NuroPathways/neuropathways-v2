import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import Anthropic from "@anthropic-ai/sdk";
import {
  DocumentProcessingError, documentAiError, requestDocumentAi,
  requireCompleteDocumentAiResponse,
} from "./documentAi";

test("actual SDK retries two temporary provider failures and succeeds on the third request", async () => {
  let calls = 0;
  const server = http.createServer((_req, res) => {
    calls++;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("retry-after", "0");
    if (calls < 3) {
      res.writeHead(503);
      res.end(JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Synthetic overload" } }));
    } else {
      res.end(JSON.stringify({
        id: "synthetic", type: "message", role: "assistant", model: "claude-sonnet-4-5",
        content: [{ type: "text", text: "Synthetic success" }],
        stop_reason: "end_turn", stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = (server.address() as { port: number }).port;
    const client = new Anthropic({ apiKey: "synthetic-not-a-real-key", baseURL: `http://127.0.0.1:${port}` });
    const response = await requestDocumentAi((options) => client.messages.create({
      model: "claude-sonnet-4-5", max_tokens: 16,
      messages: [{ role: "user", content: "Synthetic fixture" }],
    }, options));
    assert.equal(calls, 3);
    assert.equal(response.stop_reason, "end_turn");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("document AI requests have bounded retry count, per-attempt timeout and total deadline", async () => {
  await requestDocumentAi(async (options) => {
    assert.equal(options.maxRetries, 2);
    assert.equal(options.timeout, 240_000);
    assert.equal(options.signal.aborted, false);
  });
});

test("provider limits, invalid files, configuration and temporary outages have safe distinct errors", () => {
  for (const [error, code, retryable] of [
    [{ status: 400, message: "prompt too long PRIVATE_DOCUMENT_TEXT" }, "document_ai_limit", false],
    [{ status: 413 }, "document_ai_limit", false],
    [{ status: 400, message: "invalid PDF PRIVATE_DOCUMENT_TEXT" }, "document_ai_file_rejected", false],
    [{ status: 401, message: "PRIVATE_TOKEN" }, "document_ai_configuration", false],
    [{ status: 400, message: "invalid tool schema PRIVATE_PAYLOAD" }, "document_ai_configuration", false],
    [{ status: 429 }, "document_ai_busy", true],
    [{ status: 529 }, "document_ai_unavailable", true],
    [{ name: "APIConnectionTimeoutError" }, "document_ai_unavailable", true],
  ] as const) {
    const result = documentAiError(error);
    assert.equal(result.code, code);
    assert.equal(result.retryable, retryable);
    assert.doesNotMatch(result.message, /PRIVATE/);
  }
});

test("provider request failures preserve typed errors and never expose provider document text", async () => {
  await assert.rejects(requestDocumentAi(async () => {
    throw { status: 429, message: "PRIVATE_DOCUMENT_TEXT" };
  }), (error: unknown) => {
    assert.ok(error instanceof DocumentProcessingError);
    assert.equal(error.httpStatus, 503);
    assert.equal(error.code, "document_ai_busy");
    assert.doesNotMatch(error.message, /PRIVATE/);
    return true;
  });
});

test("truncated model responses cannot become completed findings", () => {
  assert.throws(() => requireCompleteDocumentAiResponse({ stop_reason: "max_tokens" }),
    (error: unknown) => error instanceof DocumentProcessingError && error.code === "document_ai_output_limit");
  assert.doesNotThrow(() => requireCompleteDocumentAiResponse({ stop_reason: "tool_use" }));
});
