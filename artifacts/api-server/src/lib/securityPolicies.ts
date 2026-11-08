import { createHash } from "node:crypto";

const PARENT_ACCOUNT_TYPES = new Set([
  "parent_free",
  "parent_family",
  "legacy_family",
  "individual",
]);

export function hashLoginIdentifier(value: unknown): string {
  return createHash("sha256")
    .update(String(value ?? "").normalize("NFKC").trim().toLowerCase())
    .digest("hex");
}

export function matchesBlockedIdentifier(
  value: unknown,
  blockedHashes: readonly string[],
): boolean {
  const normalized = String(value ?? "").normalize("NFKC").trim().toLowerCase();
  if (!normalized) return false;
  const hash = hashLoginIdentifier(normalized);
  return blockedHashes.some((blockedHash) => blockedHash === hash);
}

export function canSetSelfServiceRole(
  currentRole: string | null | undefined,
  requestedRole: unknown,
): boolean {
  if (requestedRole === undefined || requestedRole === null) return true;
  if (requestedRole === currentRole) return true;
  return requestedRole === "parent" && !currentRole;
}

export function canSetSelfServiceAccountType(
  currentRole: string | null | undefined,
  currentType: string | null | undefined,
  requestedRole: unknown,
  requestedType: unknown,
): boolean {
  if (requestedType === undefined || requestedType === null) return true;
  if (requestedType === currentType) return true;

  const effectiveRole = requestedRole ?? currentRole;
  return (
    effectiveRole === "parent" &&
    (!currentRole || currentRole === "parent") &&
    typeof requestedType === "string" &&
    PARENT_ACCOUNT_TYPES.has(requestedType)
  );
}
