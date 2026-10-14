import { createHash } from "node:crypto";
import { ipKeyGenerator } from "express-rate-limit";

export function parentLoginLimitKey(ip: string | undefined, normalizedEmail: string | null): string {
  const ipKey = ipKeyGenerator(ip || "unknown");
  if (!normalizedEmail) return `${ipKey}:invalid-email`;

  const emailHash = createHash("sha256").update(normalizedEmail).digest("hex");
  return `${ipKey}:parent:${emailHash}`;
}
