---
name: OpenAPI codegen symbol collisions
description: Avoid duplicate generated Zod exports for operation request bodies and schema types.
---

When OpenAPI code generation reports a duplicate exported symbol for a request body, prefer a named component schema referenced by the operation and keep the operation ID distinct from the component name.

**Why:** Inline request body generation can create the same exported TypeScript name in both the generated operation API and generated schema types, breaking the shared-library typecheck.

**How to apply:** After editing `lib/api-spec/openapi.yaml`, run code generation and the library typecheck. Resolve duplicate-export errors in the OpenAPI naming/reference design, not by hand-editing generated files.
