const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const dns = require("node:dns");
const http = require("node:http");
const https = require("node:https");
const tls = require("node:tls");

const evidenceDir = process.env.NP_TEST_EVIDENCE_DIR;
const blockedLog = evidenceDir ? path.join(evidenceDir, "blocked-egress.jsonl") : null;

function record(kind, host) {
  if (!blockedLog) return;
  fs.appendFileSync(blockedLog, `${JSON.stringify({
    at: new Date().toISOString(),
    kind,
    host: String(host || "unknown").slice(0, 120),
  })}\n`, { mode: 0o600 });
}

function allowed(host) {
  const value = String(host || "").replace(/^\[|\]$/g, "").toLowerCase();
  if (["localhost", "localhost.localdomain", "::1", "0:0:0:0:0:0:0:1"].includes(value)) return true;
  const family = net.isIP(value);
  return family === 4 ? value.startsWith("127.") : family === 6 && value.startsWith("::ffff:127.");
}

function assertLoopback(host, kind) {
  if (allowed(host)) return;
  record(kind, host);
  const error = new Error("Isolated test blocked non-loopback network access.");
  error.code = "NP_TEST_EGRESS_BLOCKED";
  throw error;
}

function hostFromSocketArgs(args) {
  const first = args[0];
  if (typeof first === "number") {
    const options = args[1];
    return typeof options === "string" ? options : options?.host || options?.hostname || "localhost";
  }
  if (typeof first === "string") return first.startsWith("/") ? "localhost" : first;
  return first?.host || first?.hostname || first?.serverName || first?.servername || "localhost";
}

const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  assertLoopback(hostFromSocketArgs(args), "socket");
  return originalConnect.apply(this, args);
};

for (const module of [http, https]) {
  const originalRequest = module.request;
  module.request = function (input, ...args) {
    let host = "";
    if (input instanceof URL) host = input.hostname;
    else if (typeof input === "string") {
      try { host = new URL(input).hostname; } catch { host = "unknown"; }
    } else {
      const options = args[0] && typeof args[0] === "object" ? args[0] : {};
      host = options.hostname || options.host || input?.hostname || input?.host || "localhost";
    }
    assertLoopback(host, "http-request");
    return originalRequest.call(this, input, ...args);
  };
}

const originalTlsConnect = tls.connect;
tls.connect = function (...args) {
  const input = args[0];
  assertLoopback(typeof input === "object" ? input.host || input.servername || "localhost" : input, "tls");
  return originalTlsConnect.apply(this, args);
};

const originalLookup = dns.lookup.bind(dns);
dns.lookup = function (hostname, ...args) {
  if (allowed(hostname)) return originalLookup(hostname, ...args);
  record("dns-lookup", hostname);
  const error = Object.assign(new Error("Isolated test blocked external DNS lookup."), {
    code: "NP_TEST_EGRESS_BLOCKED",
    hostname,
  });
  const callback = args.find((value) => typeof value === "function");
  if (callback) return process.nextTick(() => callback(error));
  throw error;
};

if (dns.promises?.lookup) {
  const originalPromiseLookup = dns.promises.lookup.bind(dns.promises);
  dns.promises.lookup = async function (hostname, ...args) {
    assertLoopback(hostname, "dns-promises-lookup");
    return originalPromiseLookup(hostname, ...args);
  };
}

for (const method of ["resolve", "resolve4", "resolve6", "resolveAny", "resolveCname", "resolveMx", "resolveNs", "resolveTxt", "reverse"]) {
  const original = dns[method];
  if (typeof original !== "function") continue;
  dns[method] = function (hostname, ...args) {
    if (allowed(hostname)) return original.call(this, hostname, ...args);
    record(`dns-${method}`, hostname);
    const error = Object.assign(new Error("Isolated test blocked external DNS resolution."), {
      code: "NP_TEST_EGRESS_BLOCKED",
    });
    const callback = args.find((value) => typeof value === "function");
    if (callback) return process.nextTick(() => callback(error));
    throw error;
  };
}

if (typeof globalThis.fetch === "function") {
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = function (input, init) {
    let url;
    try { url = new URL(input instanceof Request ? input.url : input); } catch {
      return Promise.reject(new Error("Isolated test blocked relative network access."));
    }
    if (!["http:", "https:"].includes(url.protocol) || !allowed(url.hostname)) {
      try { assertLoopback(url.hostname, "fetch"); } catch (error) { return Promise.reject(error); }
    }
    return originalFetch(input, init);
  };
}
