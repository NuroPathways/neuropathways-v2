const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { resolve, join } = require("node:path");
const { readdirSync, readFileSync, mkdtempSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");

const root = resolve(__dirname, "..");
const mobile = createRequire(join(root, "artifacts/neuropath-mobile/package.json"));
const web = createRequire(join(root, "artifacts/neuropath/package.json"));
const api = createRequire(join(root, "artifacts/api-server/package.json"));
const from = (requireFn, name) => createRequire(requireFn.resolve(name));
const cli = from(mobile, "@expo/cli");
const forge = cli("node-forge");
const braces = from(web, "tailwindcss")("braces");
const sprintfModule = from(from(api, "mammoth"), "argparse")("sprintf-js");

test("every consumer resolves the documented local security forks", () => {
  assert.equal(cli("node-forge/package.json").name, "@neuropath/node-forge-security");
  assert.equal(from(web, "tailwindcss")("braces/package.json").name,
    "@neuropath/braces-security");
  assert.equal(from(from(api, "mammoth"), "argparse")("sprintf-js/package.json").name,
    "@neuropath/sprintf-js-security");
});

test("RSA accepts valid signatures and rejects extra nested algorithm elements", () => {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 3 });
  const digest = forge.md.sha256.create().update("security regression").digest().getBytes();
  const { asn1 } = forge;
  const makeSignature = (withNull, extra) => {
    const algorithm = [
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false,
        asn1.oidToDer(forge.oids.sha256).getBytes()),
    ];
    if (withNull) algorithm.push(asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, ""));
    algorithm.push(...extra);
    const info = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, algorithm),
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, digest),
    ]);
    return forge.pki.rsa.encrypt(asn1.toDer(info).getBytes(), keys.privateKey, 0x01);
  };
  for (const withNull of [false, true]) {
    assert.equal(keys.publicKey.verify(digest, makeSignature(withNull, [])), true);
    for (const extra of [
      [asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, "garbage")],
      [asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, ""),
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, "")],
    ]) {
      assert.throws(() => keys.publicKey.verify(digest, makeSignature(withNull, extra)),
        /valid RSASSA-PKCS1/);
    }
  }
  const signed = keys.privateKey.sign(forge.md.sha256.create().update("normal message"));
  assert.equal(keys.publicKey.verify(
    forge.md.sha256.create().update("normal message").digest().getBytes(), signed), true);
});

test("sprintf bounds attacker-controlled precision without a RangeError", () => {
  const { sprintf, vsprintf } = sprintfModule;
  assert.equal(sprintf("%.2f", 1.25), "1.25");
  assert.equal(sprintf("%.0e", 1.25), "1e+0");
  for (const type of ["e", "f", "g"]) {
    for (const precision of ["0", "100", "101", "999999999999999999999999"]) {
      const format = `%.${precision}${type}`;
      assert.doesNotThrow(() => sprintf(format, 1.25));
      assert.doesNotThrow(() => vsprintf(format, [1.25]));
      assert.doesNotThrow(() => sprintf.format(sprintf.parse(format), [format, 1.25]));
    }
  }
});

test("braces preserves normal glob expansion and rejects deep string inputs", () => {
  assert.deepEqual(braces.expand("a/{b,c}/{1..3}"),
    ["a/b/1", "a/b/2", "a/b/3", "a/c/1", "a/c/2", "a/c/3"]);
  assert.equal(braces.compile("a/{b,c}"), "a/(b|c)");
  assert.equal(braces.stringify(braces.parse("a/{b,c}")), "a/{b,c}");
  for (const [left, right] of [["{", "}"], ["(", ")"]]) {
    const attack = left.repeat(4500) + "a,b" + right.repeat(4500);
    for (const method of ["parse", "compile", "expand", "stringify"]) {
      assert.throws(() => braces[method](attack), {
        name: "SyntaxError", message: /safe nesting depth/,
      });
    }
    assert.throws(() => braces(attack), /safe nesting depth/);
  }
});

test("braces rejects deep and cyclic caller-provided ASTs before recursion", () => {
  let ast = { type: "text", value: "x" };
  for (let i = 0; i < 10000; i++) ast = { type: "root", nodes: [ast] };
  const cyclic = { type: "root", nodes: [] };
  cyclic.nodes.push(cyclic);
  for (const input of [ast, cyclic]) {
    for (const method of ["compile", "expand", "stringify"]) {
      assert.throws(() => braces[method](input), /safe nesting depth/);
    }
  }
});

test("Metro reads image buffers and exports filesystem image assets", async () => {
  const metro = from(from(cli, "@expo/metro/package.json"), "metro");
  const assets = metro("./Assets");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=",
    "base64");
  const size = assets.getAssetSize("png", png, "test.png");
  assert.equal(size.width, 1);
  assert.equal(size.height, 1);
  const dir = mkdtempSync(join(tmpdir(), "neuropath-assets-"));
  try {
    const path = join(dir, "test.png");
    writeFileSync(path, png);
    const exported = await assets.getAssetData(path, "assets", [], null, "/assets");
    assert.equal(exported.width, 1);
    assert.equal(exported.height, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("max-stale cannot recover security-zeroed shared-cache responses", () => {
  const ngrok = from(mobile, "@expo/ngrok");
  const got = from(ngrok, "got");
  const cacheable = from(got, "cacheable-request");
  const CachePolicy = cacheable("http-cache-semantics");
  const request = { url: "https://example.test/account", method: "GET", headers: {} };
  assert.equal(cacheable("http-cache-semantics/package.json").name,
    "@neuropath/http-cache-semantics-security");
  for (const headers of [
    { "cache-control": "private" },
    { "cache-control": "no-store" },
    { "cache-control": "no-cache" },
    { "cache-control": "max-age=600", "set-cookie": "session=test-only" },
    { "cache-control": "max-age=600", vary: "*" },
    { "cache-control": "proxy-revalidate, max-age=600" },
  ]) {
    const policy = new CachePolicy(request, {
      status: 200,
      headers,
    }, { shared: true });
    assert.equal(policy.maxAge(), 0);
    for (const maxStale of ["max-stale", "max-stale=999999999999"]) {
      assert.equal(policy.satisfiesWithoutRevalidation({
        ...request, headers: { "cache-control": maxStale },
      }), false);
      assert.equal(CachePolicy.fromObject(policy.toObject()).satisfiesWithoutRevalidation({
        ...request, headers: { "cache-control": maxStale },
      }), false);
    }
  }
  for (const cacheControl of ["public, max-age=600", "immutable"]) {
    const policy = new CachePolicy(request, { status: 200, headers: {
      "cache-control": cacheControl, "set-cookie": "explicit-opt-in=test-only",
    } }, { shared: true });
    assert.equal(policy.satisfiesWithoutRevalidation(request), true);
  }
  const publicPolicy = new CachePolicy(request, { status: 200,
    headers: { "cache-control": "public, max-age=1" } });
  const originalNow = publicPolicy.now();
  publicPolicy.now = () => originalNow + 10000;
  assert.equal(publicPolicy.satisfiesWithoutRevalidation({
    ...request, headers: { "cache-control": "max-stale=100" },
  }), true);
});

test("fresh filesystem inventory contains none of the reported vulnerable pins", () => {
  const pruned = new Set(["node_modules", ".git", "vendor", ".venv", "venv",
    "target", "dist", "build", ".next", ".cache", ".expo"]);
  const bad = {
    "image-size": ["1.2.1"],
    "postcss-selector-parser": ["6.0.10", "6.1.4"],
    "http-cache-semantics": ["4.2.0"],
    "source-map-js": ["1.2.1"],
    "decode-uri-component": ["0.2.2"],
    "shell-quote": ["1.10.0"],
    "node-forge": ["1.4.0"],
    "sprintf-js": ["1.0.3"],
    braces: ["3.0.3"],
  };
  let manifests = 0;
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory() && !pruned.has(entry.name)) walk(path);
      if (!entry.isFile()) continue;
      if (entry.name === "package.json") {
        manifests++;
        const manifest = JSON.parse(readFileSync(path, "utf8"));
        for (const section of ["dependencies", "devDependencies", "peerDependencies",
          "optionalDependencies", "overrides", "resolutions"]) {
          for (const [name, versions] of Object.entries(bad)) {
            const pin = manifest[section]?.[name];
            assert.ok(!versions.includes(pin), `${path}: ${name}@${pin}`);
          }
        }
      } else if (/^(pnpm-lock\.yaml|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-workspace\.yaml)$/.test(entry.name)) {
        const text = readFileSync(path, "utf8");
        for (const [name, versions] of Object.entries(bad)) {
          for (const version of versions) {
            const exact = new RegExp(`(^|[\\s"'(:])${name}@${version.replaceAll(".", "\\.")}(?![\\d.])`, "m");
            assert.ok(!exact.test(text), `${path}: ${name}@${version}`);
          }
        }
      }
    }
  };
  walk(root);
  assert.ok(manifests >= 22, `Expected initial 18 manifests plus 4 security forks, found ${manifests}`);
});
