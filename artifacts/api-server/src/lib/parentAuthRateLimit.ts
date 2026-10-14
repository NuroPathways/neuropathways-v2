import { createHash } from "node:crypto";

export function parentLoginAccountKey(normalizedEmail: string | null): string {
  if (!normalizedEmail) return "invalid-email";

  const emailHash = createHash("sha256").update(normalizedEmail).digest("hex");
  return `parent:${emailHash}`;
}
