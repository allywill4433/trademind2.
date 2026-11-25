// Edge-safe session signing using Web Crypto (works in both Edge middleware
// and the Node.js runtime). No node:crypto or database imports here.

function sessionSecret(): string {
  return process.env.SESSION_SECRET ?? process.env.DATABASE_URL ?? "trademind-default-session-secret";
}

async function deriveKey(): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sessionSecret()));
  return crypto.subtle.importKey("raw", hash, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function base64url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

export async function signSession(): Promise<string> {
  const payload = `${Date.now()}`;
  const key = await deriveKey();
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${base64url(sig)}`;
}

export async function verifySession(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const key = await deriveKey();
  const expected = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const expectedB64 = base64url(expected);
  if (expectedB64.length !== sig.length) return false;
  // Constant-time-ish comparison.
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expectedB64.charCodeAt(i);
  if (diff !== 0) return false;
  const issued = Number(payload);
  return Number.isFinite(issued) && Date.now() - issued < 30 * 24 * 3600_000; // 30 days
}

export { fromBase64url };
