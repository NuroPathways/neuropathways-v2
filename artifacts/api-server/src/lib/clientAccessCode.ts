import crypto from "node:crypto";

function scryptHash(input: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(input, salt, 64, (error, key) => {
      if (error) reject(error);
      else resolve(key.toString("hex"));
    });
  });
}

export async function hashClientAccessCode(code: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await scryptHash(code.toUpperCase(), salt);
  return `${salt}:${hash}`;
}

export async function verifyClientAccessCode(code: string, stored: string): Promise<boolean> {
  if (!stored) return false;
  const [salt, storedHash, ...extra] = stored.split(":");

  // Retain compatibility with legacy plaintext accounts until their code is
  // rotated or migrated, but compare without an early character mismatch.
  if (extra.length === 0 && storedHash === undefined) {
    const actual = Buffer.from(code.toUpperCase(), "utf8");
    const expected = Buffer.from(stored.toUpperCase(), "utf8");
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  }

  if (extra.length > 0 || !/^[a-f0-9]{32}$/i.test(salt || "") ||
      !/^[a-f0-9]{128}$/i.test(storedHash || "")) {
    return false;
  }

  const actual = Buffer.from(await scryptHash(code.toUpperCase(), salt), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
