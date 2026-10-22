import crypto from "node:crypto";

// Change this version when the reader's extraction or safety requirements change.
const READING_VERSION = 1;

export function parentScanFingerprint(context: unknown): string {
  return crypto.createHash("sha256")
    .update(JSON.stringify({ readingVersion: READING_VERSION, context }))
    .digest("hex");
}

export function savedParentDocumentCards(value: unknown): unknown[] {
  if (Array.isArray(value)) return value; // Older completed readings.
  if (!value || typeof value !== "object") return [];
  const cards = (value as { cards?: unknown }).cards;
  return Array.isArray(cards) ? cards : [];
}

export function hasMatchingParentScan(value: unknown, fingerprint: string): boolean {
  return Boolean(value && !Array.isArray(value) && typeof value === "object" &&
    (value as { fingerprint?: unknown }).fingerprint === fingerprint &&
    (value as { complete?: unknown }).complete === true &&
    savedParentDocumentCards(value).length);
}

export function canReuseParentScan(input: {
  scanStatus: string;
  extractionIsCurrent: boolean;
  hasMatchingScan: boolean;
  guidanceIsSafe: boolean;
}): boolean {
  return input.scanStatus === "done" &&
    input.extractionIsCurrent &&
    input.hasMatchingScan &&
    input.guidanceIsSafe;
}

/** Plaintext stays in bounded, short-lived process memory, never in a new DB field. */
export class ParentDocumentTextCache {
  private entries = new Map<string, {
    expiresAt: number;
    text: Promise<string>;
    timer?: ReturnType<typeof setTimeout>;
  }>();

  constructor(private maxEntries = 32, private ttlMs = 15 * 60_000) {}

  async read(key: string, load: () => Promise<string>): Promise<string> {
    const existing = this.entries.get(key);
    if (existing && existing.expiresAt > Date.now()) {
      this.entries.delete(key);
      this.entries.set(key, existing);
      return existing.text;
    }
    if (existing?.timer) clearTimeout(existing.timer);
    this.entries.delete(key);
    const entry: { expiresAt: number; text: Promise<string>; timer?: ReturnType<typeof setTimeout> } = {
      expiresAt: Date.now() + this.ttlMs,
      text: Promise.resolve().then(load),
    };
    entry.timer = setTimeout(() => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
    }, this.ttlMs);
    entry.timer.unref();
    this.entries.set(key, entry);
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value!;
      const oldest = this.entries.get(oldestKey);
      if (oldest?.timer) clearTimeout(oldest.timer);
      this.entries.delete(oldestKey);
    }
    try {
      return await entry.text;
    } catch (error) {
      clearTimeout(entry.timer);
      if (this.entries.get(key) === entry) this.entries.delete(key);
      throw error;
    }
  }
}
