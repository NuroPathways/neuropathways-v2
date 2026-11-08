import assert from "node:assert/strict";
import test from "node:test";
import { AiOperationalControls } from "./aiOperationalControls";

test("AI controls preserve the authorized generation result and isolate actor limits", async () => {
  const controls = new AiOperationalControls({
    maxRequestsPerActor: 1,
    now: () => 1000,
  });
  const controlledResponse = { content: [{ type: "text", text: "unchanged result" }] };
  assert.deepEqual(
    await controls.run("parent-a", async () => controlledResponse),
    controlledResponse,
  );
  assert.deepEqual(
    await controls.run("parent-b", async () => controlledResponse),
    controlledResponse,
  );
  await assert.rejects(
    controls.run("parent-a", async () => assert.fail("rate-limited call reached the model")),
    /request limit/,
  );
});

test("the emergency disable switch blocks AI work before the model callback", async () => {
  const controls = new AiOperationalControls({ isDisabled: () => true });
  let called = false;
  await assert.rejects(
    controls.run("parent-a", async () => {
      called = true;
      return "must not run";
    }),
    /temporarily disabled/,
  );
  assert.equal(called, false);
});

test("AI concurrency capacity rejects excess work without running it", async () => {
  const controls = new AiOperationalControls({ maxInFlight: 1 });
  let release!: () => void;
  const pending = controls.run("parent-a", () => new Promise<string>((resolve) => {
    release = () => resolve("finished");
  }));
  await Promise.resolve();
  let secondCallRan = false;
  await assert.rejects(
    controls.run("parent-b", async () => {
      secondCallRan = true;
      return "unexpected";
    }),
    /temporarily busy/,
  );
  assert.equal(secondCallRan, false);
  release();
  assert.equal(await pending, "finished");
});
