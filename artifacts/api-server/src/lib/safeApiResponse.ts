const sensitiveCredentialKeys = new Set([
  "accesscode",
  "accesscodehash",
  "password",
  "passwordhash",
]);

function isSensitiveCredentialKey(key: string): boolean {
  return sensitiveCredentialKeys.has(key.toLowerCase().replace(/[^a-z0-9]/g, ""));
}

/** Remove credential material from any nested API response shape. */
export function stripCredentialMaterial(value: any): any {
  if (Array.isArray(value)) return value.map(stripCredentialMaterial);
  if (!value || typeof value !== "object" || value instanceof Date) return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isSensitiveCredentialKey(key))
      .map(([key, nested]) => [key, stripCredentialMaterial(nested)]),
  );
}

function camelToSnake(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/** Serialize database values and always omit credential material. */
export function serializeApiResponse(value: any): any {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(serializeApiResponse);
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return value;

  return stripCredentialMaterial(Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      camelToSnake(key),
      serializeApiResponse(nested),
    ]),
  ));
}
