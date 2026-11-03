// Verify a Firebase ID token and require the uid to be on the ALLOWED_UIDS allow-list.
// Low CPU on purpose (free plan: 10 ms per request): no loops, the JWKS is cached by jose.
import { createRemoteJWKSet, jwtVerify } from "jose";

const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

export async function requireUser(request, env, jwks = JWKS) {
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new Response("Unauthorized", { status: 401 });
  let payload;
  try {
    ({ payload } = await jwtVerify(token, jwks, {
      issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
      audience: env.FIREBASE_PROJECT_ID,
      algorithms: ["RS256"],
    }));
  } catch {
    throw new Response("Unauthorized", { status: 401 });
  }
  if (typeof payload.auth_time === "number" && payload.auth_time > Date.now() / 1000 + 60) throw new Response("Unauthorized", { status: 401 });
  const allowed = (env.ALLOWED_UIDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!payload.sub || !allowed.includes(payload.sub)) throw new Response("Forbidden", { status: 403 });
  return payload.sub; // the uid
}
