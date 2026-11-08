export function isValidFileEncryptionKey(value: unknown): value is string {
  return typeof value === "string" && /^[a-f\d]{64}$/i.test(value);
}
