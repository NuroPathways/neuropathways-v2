import crypto from "node:crypto";

export function hashClinicianPassword(password: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, key) => {
      if (error) reject(error);
      else resolve(key.toString("hex"));
    });
  });
}

export async function createClinicianPasswordHash(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${await hashClinicianPassword(password, salt)}`;
}

export async function verifyClinicianPassword(password: string, encoded: string): Promise<boolean> {
  const [salt, storedHash] = encoded.split(":");
  if (!/^[a-f0-9]{32}$/i.test(salt || "") || !/^[a-f0-9]{128}$/i.test(storedHash || "")) {
    return false;
  }

  const actual = Buffer.from(await hashClinicianPassword(password, salt), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
