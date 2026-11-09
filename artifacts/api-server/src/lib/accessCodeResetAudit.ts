import crypto from "node:crypto";

/**
 * Derive a non-bearer audit identifier from the stored reset-token hash.
 * Reset tokens are high-entropy random values; hashing the hash keeps the
 * correlation key useful without persisting the token or its lookup hash.
 */
export function accessCodeResetAuditTargetId(tokenHash: string): string {
  const fingerprint = crypto.createHash("sha256").update(tokenHash).digest("hex").slice(0, 24);
  return `resetlink_${fingerprint}`;
}
