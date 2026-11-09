import assert from "node:assert/strict";
import { test } from "node:test";
import { respondWithInternalError } from "./apiError";

test("internal failures return a generic message and log no database text", () => {
  const logEntries: Array<{ context: Record<string, unknown>; message: string }> = [];
  let statusCode = 0;
  let responseBody: Record<string, unknown> = {};
  const req = {
    id: "request-123",
    log: {
      error(context: Record<string, unknown>, message: string) {
        logEntries.push({ context, message });
      },
    },
  };
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(body: Record<string, unknown>) {
      responseBody = body;
    },
  };
  const internalMessage = 'Failed query: insert into "children" values ($1) -- parameter: Jane';

  respondWithInternalError(
    req,
    res,
    Object.assign(new Error(internalMessage), { code: "23505" }),
    "create-client-account",
  );

  assert.equal(statusCode, 500);
  assert.equal(responseBody.error, "An unexpected error occurred. Please try again.");
  assert.equal(responseBody.request_id, "request-123");
  assert.equal(JSON.stringify(responseBody).includes("Failed query"), false);
  assert.equal(JSON.stringify(responseBody).includes("Jane"), false);
  assert.equal(logEntries.length, 1);
  assert.deepEqual(logEntries[0].context, {
    operation: "create-client-account",
    error_name: "Error",
    error_code: "23505",
    request_id: "request-123",
  });
  assert.equal(JSON.stringify(logEntries[0]).includes(internalMessage), false);
});
