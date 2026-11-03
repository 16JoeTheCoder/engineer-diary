import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from "jose";
import { buildKey, safeName } from "../edge-lib/r2.js";
import { requireUser } from "../edge-lib/auth.js";

test("safeName strips paths and odd characters", () => {
  assert.equal(safeName("../../etc/passwd"), "..-..-etc-passwd");
  assert.equal(safeName("bracket v3 (final).STL"), "bracket-v3-final-.STL");
  assert.equal(safeName("////"), "file");
  assert.equal(safeName("a".repeat(200)).length, 80);
});

test("buildKey uses the uid and rejects bad ids", () => {
  assert.equal(buildKey("u1", "proj123", "file456", "x.stl"), "u1/proj123/file456/x.stl");
  for (const [p, f] of [["../x", "file456"], ["proj123", "a/b"], ["abc", "file456"], ["proj123", ""]]) {
    assert.throws(() => buildKey("u1", p, f, "x.stl"), (r) => r instanceof Response && r.status === 400);
  }
});

const env = { FIREBASE_PROJECT_ID: "fuse-test", ALLOWED_UIDS: "josef, other" };
const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
const jwks = createLocalJWKSet({ keys: [jwk] });
const sign = (claims = {}, { exp = "1h", aud = env.FIREBASE_PROJECT_ID, sub = "josef" } = {}) =>
  new SignJWT({ auth_time: Math.floor(Date.now() / 1000) - 10, ...claims }).setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(`https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`).setAudience(aud).setSubject(sub).setIssuedAt().setExpirationTime(exp).sign(privateKey);
const req = (token) => new Request("https://x/api", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
const status = async (p) => { try { await p; return 200; } catch (r) { return r.status; } };

test("requireUser accepts a valid allow-listed token", async () => {
  assert.equal(await requireUser(req(await sign()), env, jwks), "josef");
});
test("requireUser rejects missing, expired, wrong-audience and non-allow-listed tokens", async () => {
  assert.equal(await status(requireUser(req(""), env, jwks)), 401);
  assert.equal(await status(requireUser(req(await sign({}, { exp: Math.floor(Date.now() / 1000) - 60 })), env, jwks)), 401);
  assert.equal(await status(requireUser(req(await sign({}, { aud: "someone-else" })), env, jwks)), 401);
  assert.equal(await status(requireUser(req(await sign({}, { sub: "stranger" })), env, jwks)), 403);
});
