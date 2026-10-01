import crypto from "node:crypto";
import { Storage } from "@google-cloud/storage";

const SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

const ENCRYPTED_PREFIX = Buffer.from("NPF1");

function encryptionKey(): Buffer {
  const value = process.env.FILE_ENCRYPTION_KEY;
  if (!value || !/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error("Encrypted parent document storage is unavailable");
  }
  return Buffer.from(value, "hex");
}

function privateRoot(): { bucketName: string; objectPrefix: string } {
  const dir = process.env.PRIVATE_OBJECT_DIR;
  if (!dir) throw new Error("Private document storage is unavailable");
  const normalized = dir.replace(/^\/+|\/+$/g, "");
  const [bucketName, ...prefixParts] = normalized.split("/");
  if (!bucketName || !/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/i.test(bucketName)) {
    throw new Error("Private document storage is unavailable");
  }
  const objectPrefix = prefixParts.join("/");
  if (objectPrefix.split("/").some((part) => part === "." || part === "..")) {
    throw new Error("Private document storage is unavailable");
  }
  return { bucketName, objectPrefix };
}

function encrypt(plain: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([ENCRYPTED_PREFIX, iv, cipher.getAuthTag(), ciphertext]);
}

function decrypt(ciphertext: Buffer): Buffer {
  if (ciphertext.length < ENCRYPTED_PREFIX.length + 12 + 16 + 1 ||
      !ciphertext.subarray(0, ENCRYPTED_PREFIX.length).equals(ENCRYPTED_PREFIX)) {
    throw new Error("Stored parent document is unreadable");
  }
  const offset = ENCRYPTED_PREFIX.length;
  const iv = ciphertext.subarray(offset, offset + 12);
  const tag = ciphertext.subarray(offset + 12, offset + 28);
  const encrypted = ciphertext.subarray(offset + 28);
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  } catch {
    throw new Error("Stored parent document is unreadable");
  }
}

function objectLocation(storagePath: string): { bucketName: string; objectName: string } {
  const root = privateRoot();
  const parts = storagePath.split("/");
  const bucketName = parts.shift();
  const objectName = parts.join("/");
  const expectedPrefix = [root.objectPrefix, "parent-documents"].filter(Boolean).join("/");
  if (
    bucketName !== root.bucketName ||
    !objectName.startsWith(`${expectedPrefix}/`) ||
    objectName.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error("Invalid private document storage path");
  }
  return { bucketName, objectName };
}

export async function saveEncryptedParentDocument(documentId: string, plain: Buffer): Promise<string> {
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) throw new Error("Invalid document identifier");
  const { bucketName, objectPrefix } = privateRoot();
  const objectName = [objectPrefix, "parent-documents", `${documentId}.enc`].filter(Boolean).join("/");
  const encrypted = encrypt(plain);
  await objectStorageClient
    .bucket(bucketName)
    .file(objectName)
    .save(encrypted, {
      resumable: false,
      preconditionOpts: { ifGenerationMatch: 0 },
      metadata: {
        contentType: "application/octet-stream",
        cacheControl: "private, no-store",
        metadata: { encryption: "AES-256-GCM", format: "NPF1" },
      },
    });
  return `${bucketName}/${objectName}`;
}

export async function readEncryptedParentDocument(storagePath: string): Promise<Buffer> {
  const { bucketName, objectName } = objectLocation(storagePath);
  const [encrypted] = await objectStorageClient.bucket(bucketName).file(objectName).download();
  return decrypt(encrypted);
}

export async function deleteEncryptedParentDocument(storagePath: string): Promise<void> {
  const { bucketName, objectName } = objectLocation(storagePath);
  await objectStorageClient.bucket(bucketName).file(objectName).delete({ ignoreNotFound: true });
}

export const deleteEncryptedParentFile = deleteEncryptedParentDocument;