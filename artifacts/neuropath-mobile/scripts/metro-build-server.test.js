const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { chooseMetroPort, checkMetroHealth } = require("./metro-build-server");

async function fixture(t, handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { port: server.address().port, url: `http://127.0.0.1:${server.address().port}` };
}

test("chooses a free port without using an occupied preview port", async (t) => {
  const preview = await fixture(t, (_req, res) => res.end("preview"));
  const chosen = await chooseMetroPort();
  assert.notEqual(chosen, preview.port);
  await assert.rejects(chooseMetroPort(String(preview.port)), /Cannot use/);
  assert.equal(await (await fetch(preview.url)).text(), "preview");
});

test("validates configured ports", async () => {
  for (const port of ["", "0", "-1", "65536", "abc", "1.5"]) {
    await assert.rejects(chooseMetroPort(port), /must be an integer/);
  }
  const free = await chooseMetroPort();
  assert.equal(await chooseMetroPort(String(free)), free);
});

test("requires the actual Metro health response", async (t) => {
  const metro = await fixture(t, (_req, res) => res.end("packager-status:running"));
  const other = await fixture(t, (_req, res) => res.end("<html>preview</html>"));
  const redirect = await fixture(t, (_req, res) => {
    res.writeHead(302, { Location: metro.url });
    res.end();
  });
  assert.equal(await checkMetroHealth(metro.url), true);
  assert.equal(await checkMetroHealth(other.url), false);
  assert.equal(await checkMetroHealth(redirect.url), false);
});
