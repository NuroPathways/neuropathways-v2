import test from "node:test";
import assert from "node:assert/strict";
import {
  canReuseParentScan,
  hasMatchingParentScan,
  parentScanFingerprint,
  ParentDocumentTextCache,
  savedParentDocumentCards,
} from "./parentDocumentScanCache";

test("completed readings are reusable only for the same source and goal context", () => {
  const context = { hash: "file-a", goal: "request help", clinicianDocuments: ["plan-a"] };
  const fingerprint = parentScanFingerprint(context);
  const result = { fingerprint, complete: true, cards: [{ id: "card" }] };
  assert.equal(hasMatchingParentScan(result, parentScanFingerprint(context)), true);
  for (const changed of [
    { ...context, hash: "file-b" },
    { ...context, goal: "ask for a break" },
    { ...context, clinicianDocuments: ["plan-b"] },
  ]) {
    assert.equal(hasMatchingParentScan(result, parentScanFingerprint(changed)), false);
  }
  assert.equal(hasMatchingParentScan({ ...result, complete: false }, fingerprint), false);
  assert.equal(hasMatchingParentScan({ ...result, cards: [] }, fingerprint), false);
});

test("older findings remain readable but are not mistaken for a current completed scan", () => {
  const cards = [{ id: "older-card" }];
  assert.deepEqual(savedParentDocumentCards(cards), cards);
  assert.deepEqual(savedParentDocumentCards({ cards }), cards);
  assert.deepEqual(savedParentDocumentCards(null), []);
  assert.equal(hasMatchingParentScan(cards, "fingerprint"), false);
});

test("completed scans with only unreviewed concern draft cards can be reused", () => {
  const result = {
    fingerprint: "support-concern-fingerprint",
    complete: true,
    cards: [],
    supportConcernCards: [{ id: "document-concern:draft" }],
  };
  assert.equal(hasMatchingParentScan(result, "support-concern-fingerprint"), true);
  assert.equal(hasMatchingParentScan({ ...result, complete: false }, "support-concern-fingerprint"), false);
});

test("only fully completed and safe scans can bypass a retry", () => {
  const current = {
    extractionIsCurrent: true,
    hasMatchingScan: true,
    guidanceIsSafe: true,
  };
  assert.equal(canReuseParentScan({ ...current, scanStatus: "error" }), false);
  assert.equal(canReuseParentScan({ ...current, scanStatus: "done" }), true);
  assert.equal(canReuseParentScan({ ...current, scanStatus: "done", guidanceIsSafe: false }), false);
});

test("repeat and simultaneous reads share one extraction without crossing document keys", async () => {
  const cache = new ParentDocumentTextCache();
  let loads = 0;
  const load = async () => { loads++; return "source text"; };
  assert.deepEqual(await Promise.all([cache.read("doc-a:hash", load), cache.read("doc-a:hash", load)]), ["source text", "source text"]);
  await cache.read("doc-a:hash", load);
  assert.equal(loads, 1);
  await cache.read("doc-b:hash", load);
  assert.equal(loads, 2);
});

test("failed extraction is retryable and the plaintext cache is bounded and expires", async () => {
  const cache = new ParentDocumentTextCache(1);
  await assert.rejects(cache.read("a", async () => { throw new Error("reader failed"); }), /reader failed/);
  assert.equal(await cache.read("a", async () => "retried"), "retried");
  await cache.read("b", async () => "other");
  assert.equal(await cache.read("a", async () => "reloaded"), "reloaded");
  const expired = new ParentDocumentTextCache(1, 0);
  await expired.read("a", async () => "old");
  assert.equal(await expired.read("a", async () => "new"), "new");
});
