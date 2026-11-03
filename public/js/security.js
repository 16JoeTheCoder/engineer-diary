// Delete passcode: friction against accidents, not security against an attacker (the browser checks it).
// Only a salted PBKDF2-SHA256 hash is stored, in meta/security. Firestore rules are the real protection.
import { b64FromBytes, bytesFromB64 } from "./util.js";

export const ITERATIONS = 150000;

async function derive(code, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(code)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPasscode(code, { iterations = ITERATIONS, salt = crypto.getRandomValues(new Uint8Array(16)) } = {}) {
  const hash = await derive(code, salt, iterations);
  return { salt: b64FromBytes(salt), hash: b64FromBytes(hash), iterations };
}

export async function verifyPasscode(code, rec) {
  if (!rec?.hash || !rec?.salt) return false;
  const got = await derive(code, bytesFromB64(rec.salt), rec.iterations || ITERATIONS);
  const want = bytesFromB64(rec.hash);
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];
  return diff === 0;
}
