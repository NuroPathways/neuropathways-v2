const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { resolveStaticFilePath, resolveRealStaticFilePath } = require("./staticPathSafety");

test("resolves normal assets under the static build root", () => {
  const root = path.resolve("/tmp/neuropath-static-build");
  assert.equal(
    resolveStaticFilePath(root, "/assets/app.js"),
    path.join(root, "assets", "app.js"),
  );
});

test("rejects paths that resolve outside the static build root", () => {
  const root = path.resolve("/tmp/neuropath-static-build");
  assert.equal(resolveStaticFilePath(root, "/../../private.txt"), null);
  assert.equal(resolveStaticFilePath(root, "/../neuropath-static-build-evil/file.js"), null);
  assert.equal(resolveStaticFilePath(root, "/bad\u0000name.js"), null);
});

test("rejects static-file symlinks that escape the build root", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "neuropath-static-path-"));
  const root = path.join(temporaryRoot, "build");
  const outside = path.join(temporaryRoot, "private.txt");
  fs.mkdirSync(root);
  fs.writeFileSync(outside, "private test fixture");
  fs.symlinkSync(outside, path.join(root, "outside.txt"));

  try {
    const candidate = resolveStaticFilePath(root, "/outside.txt");
    assert.ok(candidate);
    assert.equal(resolveRealStaticFilePath(root, candidate), null);
    fs.writeFileSync(path.join(root, "asset.js"), "synthetic asset");
    const validCandidate = resolveStaticFilePath(root, "/asset.js");
    assert.ok(validCandidate);
    assert.equal(resolveRealStaticFilePath(root, validCandidate), path.join(root, "asset.js"));
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
