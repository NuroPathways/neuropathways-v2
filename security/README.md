# Dependency security remediation

The whole repository was walked with prune-style exclusions for dependencies,
VCS data and build output. The initial inventory contained 18 package manifests:
the root, four artifacts, six library/script packages, and seven unused skill
templates. All use the enclosing pnpm workspace and its single lockfile; the
templates have no independent lockfile. `pnpm audit --fix` was executed from
every discovered directory. pnpm writes workspace-wide fixes to
`pnpm-workspace.yaml`, even when invoked from a nested directory.

## Published fixes

Workspace overrides enforce compatible security floors for:

| Package | Minimum version | Advisory |
| --- | --- | --- |
| image-size | 2.0.3 | GHSA-w3rx-r6r6-pgpr, GHSA-5p2g-fcmc-qvqq |
| postcss-selector-parser | 7.1.6 | GHSA-rj75-hqrm-r3gf |
| source-map-js | 1.2.2 | GHSA-68fv-2mgg-jv7q |
| decode-uri-component | 0.5.0 | GHSA-vcc3-ghjq-m6fr |
| shell-quote | 1.11.0 | GHSA-pqg4-j6r4-53mv |

Metro and its companion packages are aligned to 0.83.8, within Expo SDK 54's
existing 0.83 line. The earlier 0.83.3 asset exporter passed filenames to
image-size; upgrading image-size alone broke native asset export because v2
accepts buffers. Metro's patch release instead uses its own image-dimension
implementation and removes image-size from the resolved dependency graph.
The security floor remains to prevent vulnerable versions from returning if
another consumer is introduced. Native/web exports pass without a custom shim.

## Local forks for advisories without a published fix

As of 2026-10-09 the registry's latest `node-forge`, `sprintf-js`, `braces`,
and `http-cache-semantics` were still affected. Merely updating their version numbers or ignoring the
advisories would not fix the code. The packages in `security/packages` are
explicitly named **local security forks**, not purported upstream releases.
Their original runtime sources and licenses are retained, with these changes:

* **node-forge**, based on upstream 1.4.0 (BSD-3-Clause OR GPL-2.0):
  GHSA-86w9-cpqp-85rv. RSA PKCS#1 v1.5 verification now enforces the exact
  nested DigestAlgorithm element count, including the optional NULL parameter.
  Valid signatures still verify; extra nested elements are rejected.
  This is used by Expo CLI and certificate tooling, not the application's
  authentication or clinical API.
* **sprintf-js**, based on upstream 1.0.3 (BSD-3-Clause):
  GHSA-hp3w-g68c-fv3c. Numeric precision is bounded to ECMAScript's supported
  range before formatting, including direct `sprintf.format` calls.
  Out-of-range precision is clamped, so it cannot raise the reported RangeError.
  It is pulled in by Mammoth's argparse dependency; that caller uses fixed
  format strings rather than uploaded document contents.
* **braces**, based on upstream 3.0.3 (MIT):
  GHSA-vfj7-8cjw-p6xm. Parsing imposes a non-disableable 64-level nesting ceiling
  for both braces and parentheses. All three recursive AST entry points first
  validate depth iteratively and reject cycles, including caller-supplied ASTs.
  Excessive nesting raises a deliberate SyntaxError before stack exhaustion.
  Used by Tailwind and Metro/Jest glob tooling, not an exposed API.
* **http-cache-semantics**, based on upstream 4.3.0 (BSD-2-Clause):
  GHSA-ch52-4w7c-c8xp. Although the registry had a release newer than the
  reported 4.2.0, an attack regression confirmed 4.3.0 remained affected.
  Cache eligibility is checked before permitting stale hits: non-storable,
  no-cache, shared-cookie-without-opt-in, wildcard Vary, and shared
  proxy-revalidate responses all require origin revalidation. Normal public
  cache entries retain their stale behavior. Used by ngrok/got development
  tooling, not a shared cache in the clinical API.

The forks have separate package identities and are wired into **every**
transitive consumer with workspace `file:` overrides. They are normal,
inspectable workspace packages, not hidden in excluded vendor folders.
Upstream URLs:

* https://github.com/digitalbazaar/forge
* https://github.com/alexei/sprintf.js
* https://github.com/micromatch/braces
* https://github.com/kornelski/http-cache-semantics

Run `pnpm run test:security` for attack regressions, consumer-resolution checks,
and a fresh filesystem walk that rejects the listed vulnerable pins.
When upstream fixes become available, replace the corresponding file override
with a bounded upstream security floor and retain these regression tests.
