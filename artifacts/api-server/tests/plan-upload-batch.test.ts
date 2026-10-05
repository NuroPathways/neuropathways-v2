import assert from "node:assert/strict";
import test from "node:test";
import {
  runParentDocumentScanBatch,
  runPlanUploadBatch,
  type PlanUploadItem,
} from "../../../lib/api-client-react/src/plan-upload-batch";

function items(...names: string[]): PlanUploadItem<string>[] {
  return names.map((file) => ({ key: file, file, phase: "queued" }));
}
test("multiple selected files upload and scan sequentially", async () => {
  const events: string[] = [];
  const rows = items("one", "two", "three");
  const result = await runPlanUploadBatch(rows, {
    upload: async (file) => { events.push(`upload:${file}`); return { id: file }; },
    scan: async (id) => { events.push(`scan:${id}`); },
    update: (key, patch) => Object.assign(rows.find((row) => row.key === key)!, patch),
    errorMessage: String,
  });
  assert.deepEqual(events, ["upload:one", "scan:one", "upload:two", "scan:two", "upload:three", "scan:three"]);
  assert.deepEqual(result, { saved: 3, completed: 3, failed: 0, cancelled: false });
  assert(rows.every((row) => row.phase === "complete"));
});
test("upload and scan failures do not stop subsequent files; retries never re-upload saved files", async () => {
  const rows = items("bad-upload", "bad-scan", "good");
  const uploads: string[] = [];
  let retry = false;
  const handlers = {
    upload: async (file: string) => {
      uploads.push(file);
      if (!retry && file === "bad-upload") throw new Error("Network failed");
      return { id: file };
    },
    scan: async (id: string) => { if (!retry && id === "bad-scan") throw new Error("Reading failed"); },
    update: (key: string, patch: Partial<PlanUploadItem<string>>) => Object.assign(rows.find((row) => row.key === key)!, patch),
    errorMessage: String,
  };
  const result = await runPlanUploadBatch(rows, handlers);
  assert.deepEqual(result, { saved: 2, completed: 1, failed: 2, cancelled: false });
  assert.equal(rows[0].phase, "upload_failed");
  assert.equal(rows[1].phase, "scan_failed");
  assert.equal(rows[1].documentId, "bad-scan");
  retry = true;
  await runPlanUploadBatch(rows.filter((row) => row.phase !== "complete"), handlers);
  assert.deepEqual(uploads, ["bad-upload", "bad-scan", "good", "bad-upload"]);
  assert(rows.every((row) => row.phase === "complete"));
});
test("oversized file is rejected individually without blocking a valid file", async () => {
  const uploads: string[] = [];
  const rows = items("oversized", "good");
  const result = await runPlanUploadBatch(rows, {
    validate: (file) => file === "oversized" ? "Over 20 MB" : undefined,
    upload: async (file) => { uploads.push(file); return { id: file }; },
    scan: async () => undefined,
    update: (key, patch) => Object.assign(rows.find((row) => row.key === key)!, patch),
    errorMessage: String,
  });
  assert.deepEqual(uploads, ["good"]);
  assert.equal(result.failed, 1);
  assert.equal(result.completed, 1);
});
test("leaving the child's upload screen stops remaining requests without losing an uploaded document", async () => {
  let active = true;
  const requests: string[] = [];
  const result = await runPlanUploadBatch(items("one", "two"), {
    isActive: () => active,
    upload: async (file) => { requests.push(file); active = false; return { id: file }; },
    scan: async (id) => { requests.push(`scan:${id}`); },
    update: () => undefined,
    errorMessage: String,
  });
  assert.deepEqual(requests, ["one"]);
  assert.equal(result.saved, 1);
  assert.equal(result.cancelled, true);
});

test("saved plans are read sequentially and later plans continue after one fails", async () => {
  const documents = [{ id: "one" }, { id: "two" }, { id: "three" }];
  const events: string[] = [];
  const result = await runParentDocumentScanBatch(documents, {
    scan: async (document) => {
      events.push(`start:${document.id}`);
      if (document.id === "two") throw new Error("Unreadable plan");
      events.push(`finish:${document.id}`);
    },
    onProgress: (document, index, total) => {
      events.push(`progress:${index + 1}/${total}:${document.id}`);
    },
  });

  assert.deepEqual(events, [
    "progress:1/3:one", "start:one", "finish:one",
    "progress:2/3:two", "start:two",
    "progress:3/3:three", "start:three", "finish:three",
  ]);
  assert.equal(result.scanned, 2);
  assert.equal(result.failed, 1);
  assert.deepEqual(result.outcomes.map((outcome) => outcome.ok), [true, false, true]);
});