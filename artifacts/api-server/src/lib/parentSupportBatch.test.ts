import test from "node:test";
import assert from "node:assert/strict";
import { batchProcessParentSupport } from "./parentSupportBatch";

test("parent support batch preserves item order while limiting concurrency", async () => {
  let active = 0;
  let peakActive = 0;
  const outcomes = await batchProcessParentSupport(
    [100, 1, 20, 5],
    async (duration) => {
      active++;
      peakActive = Math.max(peakActive, active);
      await new Promise((resolve) => setTimeout(resolve, duration));
      active--;
      return duration;
    },
    { concurrency: 2, retries: 0 },
  );

  assert.equal(peakActive, 2);
  assert.deepEqual(outcomes, [
    { ok: true, value: 100 },
    { ok: true, value: 1 },
    { ok: true, value: 20 },
    { ok: true, value: 5 },
  ]);
});

test("parent support batch retries rate limits with backoff and keeps successes", async () => {
  const attempts = new Map<number, number>();
  const outcomes = await batchProcessParentSupport(
    [0, 1],
    async (item) => {
      const count = (attempts.get(item) ?? 0) + 1;
      attempts.set(item, count);
      if (item === 0 && count === 1) {
        const error = new Error("429 rate limit exceeded") as Error & { status: number };
        error.status = 429;
        throw error;
      }
      if (item === 1) throw new Error("invalid model response");
      return "saved";
    },
    { concurrency: 2, retries: 1, minTimeoutMs: 0 },
  );

  assert.equal(attempts.get(0), 2);
  assert.deepEqual(outcomes[0], { ok: true, value: "saved" });
  assert.equal(outcomes[1]?.ok, false);
});

test("parent support batch treats an empty target list as complete", async () => {
  assert.deepEqual(await batchProcessParentSupport([], async () => "unused"), []);
});
