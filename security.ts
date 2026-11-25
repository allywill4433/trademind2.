import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "@/db";
import { auditLog } from "@/db/schema";

// Security primitives: AES-256-GCM credential encryption, audit logging, and
// optional single-user password authentication. Broker keys stay in .env and
// are never exposed to the client. LLM keys entered in the UI are stored
// encrypted in the database.

function encryptionKey(): Buffer {
  const fromEnv = process.env.ENCRYPTION_KEY;
  if (fromEnv) {
    const buf = Buffer.from(fromEnv, "base64");
    if (buf.length === 32) return buf;
  }
  // Derive a stable key from the database URL so encryption works out of the box.
  return createHash("sha256").update(process.env.DATABASE_URL ?? "trademind-default-key").digest();
}

export function encryptText(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptText(blob: string): string {
  const buf = Buffer.from(blob, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export async function audit(actor: string, action: string, details?: Record<string, unknown>): Promise<void> {
  await db.insert(auditLog).values({ actor, action, details: details ?? null });
}

// --- Optional password gate -------------------------------------------------

export function authEnabled(): boolean {
  return Boolean(process.env.APP_PASSWORD && process.env.APP_PASSWORD.length >= 4);
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("base64")}:${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [saltB64, hashB64] = stored.split(":");
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const actual = scryptSync(password, salt, 64);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function checkPassword(password: string): boolean {
  const expected = process.env.APP_PASSWORD ?? "";
  if (!expected) return true;
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Session signing lives in @/lib/session (Edge-safe Web Crypto) so middleware
// can verify sessions without node:crypto or the database driver.
