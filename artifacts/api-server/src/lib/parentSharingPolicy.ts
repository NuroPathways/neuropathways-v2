export function nextParentClinicConsentScopes(
  currentScopes: unknown,
  sharingDocument: boolean,
  anotherSharedDocumentRemains: boolean,
): { scopes: string[]; revoked: boolean } {
  const scopes = Array.isArray(currentScopes)
    ? [...new Set(currentScopes.filter((scope): scope is string => typeof scope === "string" && scope.length > 0))]
    : [];

  if (sharingDocument) {
    if (!scopes.includes("documents")) scopes.push("documents");
  } else if (!anotherSharedDocumentRemains) {
    return {
      scopes: scopes.filter((scope) => scope !== "documents"),
      revoked: scopes.every((scope) => scope === "documents"),
    };
  }

  return { scopes, revoked: scopes.length === 0 };
}
