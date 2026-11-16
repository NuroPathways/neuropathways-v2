import crypto from "node:crypto";

export const CLINIC_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function normalizeInvitationEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) return null;
  return email;
}

export function createClinicInvitationToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashClinicInvitationToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export function createClinicInvitationLink(baseUrl: string, token: string): string {
  const url = new URL(baseUrl);
  url.hash = new URLSearchParams({ token }).toString();
  return url.toString();
}
