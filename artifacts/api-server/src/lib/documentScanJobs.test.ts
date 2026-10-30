import assert from "node:assert/strict";
import test from "node:test";
import type { Response } from "express";
import { DocumentScanJobs } from "./documentScanJobs";

function reply() {
  const state: { status: number; body?: any } = { status: 200 };
  const response = {
    status(code: number) { state.status = code; return response; },
    json(body: unknown) { state.body = body; return response; },
  };
  return { state, response: response as unknown as Response };
}

test("scan jobs acknowledge immediately, deduplicate active work and retain the completed result", () => {
  const jobs = new DocumentScanJobs();
  const initial = reply();
  const collector = jobs.attach({}, "authorized-parent:child:document", initial.response)!;
  assert.equal(initial.state.status, 202);
  assert.equal(initial.state.body.status, "processing");
  const duplicate = reply();
  assert.equal(jobs.attach({}, "authorized-parent:child:document", duplicate.response), null);
  assert.equal(duplicate.state.body.scan_job_id, initial.state.body.scan_job_id);
  collector.json({ scanned: ["document"], profile: { behaviors: ["synthetic"] } });
  const poll = reply();
  jobs.attach({ scan_job_id: initial.state.body.scan_job_id }, "authorized-parent:child:document", poll.response);
  assert.equal(poll.state.body.status, "complete");
  assert.equal(poll.state.body.result_status, 200);
  assert.deepEqual(poll.state.body.result.scanned, ["document"]);
});

test("job IDs never authorize another actor, child or document", () => {
  const jobs = new DocumentScanJobs();
  const initial = reply();
  jobs.attach({}, "parent:one:child:document", initial.response);
  for (const scope of ["parent:two:child:document", "parent:one:other-child:document", "parent:one:child:other-doc"]) {
    const poll = reply();
    assert.equal(jobs.attach({ scan_job_id: initial.state.body.scan_job_id }, scope, poll.response), null);
    assert.equal(poll.state.status, 404);
    assert.equal(poll.state.body.result, undefined);
  }
});

test("failed jobs retain their actual error status and permit a fresh retry", () => {
  const jobs = new DocumentScanJobs();
  const initial = reply();
  const collector = jobs.attach({}, "scope", initial.response)!;
  collector.status(422).json({ error: "Synthetic unreadable file" });
  const poll = reply();
  jobs.attach({ scan_job_id: initial.state.body.scan_job_id }, "scope", poll.response);
  assert.equal(poll.state.body.result_status, 422);
  assert.equal(poll.state.body.result.error, "Synthetic unreadable file");
  const retry = reply();
  assert.ok(jobs.attach({}, "scope", retry.response));
  assert.notEqual(retry.state.body.scan_job_id, initial.state.body.scan_job_id);
});

test("a stalled scan has a real terminal deadline and late results cannot resurrect it", async () => {
  const jobs = new DocumentScanJobs(10);
  const initial = reply();
  const collector = jobs.attach({}, "scope", initial.response)!;
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(collector.locals.documentScanSignal.aborted, true);
  collector.json({ scanned: ["late-result"] });
  const poll = reply();
  jobs.attach({ scan_job_id: initial.state.body.scan_job_id }, "scope", poll.response);
  assert.equal(poll.state.body.status, "complete");
  assert.equal(poll.state.body.result_status, 503);
  assert.equal(poll.state.body.result.error.code, "scan_timeout");
});

test("deleting a source aborts its active scan without touching another source", () => {
  const jobs = new DocumentScanJobs();
  const initial = reply();
  const scope = JSON.stringify(["clinician:one", "child", "document"]);
  const collector = jobs.attach({}, scope, initial.response)!;
  const other = reply();
  const otherCollector = jobs.attach({}, JSON.stringify(["clinician:one", "child", "other-document"]), other.response)!;
  jobs.cancelDocument("document");
  assert.equal(collector.locals.documentScanSignal.aborted, true);
  assert.equal(otherCollector.locals.documentScanSignal.aborted, false);
  const poll = reply();
  jobs.attach({ scan_job_id: initial.state.body.scan_job_id }, scope, poll.response);
  assert.equal(poll.state.body.result_status, 409);
});
