import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import express from "express";
import { test } from "node:test";

test("legacy authenticated uploads are encrypted before reaching disk", async (t) => {
  const originalCwd = process.cwd();
  const originalKey = process.env.FILE_ENCRYPTION_KEY;
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "neuropath-upload-security-"));
  process.chdir(temporaryRoot);
  process.env.FILE_ENCRYPTION_KEY = "a".repeat(64);

  let server: ReturnType<express.Application["listen"]> | undefined;
  try {
    const { default: uploadRouter, decryptBuffer } = await import("./upload");
    const app = express();
    app.use((req: any, _res, next) => {
      req.user = { id: "isolated-upload-security-test" };
      next();
    });
    app.use(uploadRouter);

    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const source = Buffer.from("%PDF-1.4\nsynthetic encrypted upload test\n%%EOF\n");
    const form = new FormData();
    form.append("file", new Blob([source], { type: "application/pdf" }), "report.pdf");

    const response = await fetch(`http://127.0.0.1:${address.port}/upload`, {
      method: "POST",
      body: form,
    });
    assert.equal(response.status, 200);
    const payload = await response.json() as { file_url?: string };
    assert.match(payload.file_url ?? "", /^\/api\/uploads\/[0-9a-f-]{36}\.pdf$/i);

    const storedPath = path.join(temporaryRoot, "uploads", path.basename(payload.file_url!));
    const storedBytes = fs.readFileSync(storedPath);
    assert.equal(storedBytes.includes(source), false);
    assert.deepEqual(decryptBuffer(storedBytes), source);
  } finally {
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => error ? reject(error) : resolve());
      });
    }
    process.chdir(originalCwd);
    if (originalKey === undefined) delete process.env.FILE_ENCRYPTION_KEY;
    else process.env.FILE_ENCRYPTION_KEY = originalKey;
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
