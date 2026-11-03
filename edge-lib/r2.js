// Key builder and presigner. The server, not the client, decides the key.
import { AwsClient } from "aws4fetch";

export const MAX_FILE_BYTES = 200 * 1024 * 1024;
export const MIMES = new Set(["model/stl", "application/step", "model/gltf-binary", "application/pdf", "image/png", "image/jpeg", "image/webp", "application/zip", "text/markdown"]);

export function safeName(name) {
  const base = String(name).normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return base || "file";
}

export function buildKey(uid, projectId, fileId, name) {
  const id = /^[a-zA-Z0-9_-]{6,64}$/;
  if (!id.test(String(projectId)) || !id.test(String(fileId))) throw new Response("Bad id", { status: 400 });
  return `${uid}/${projectId}/${fileId}/${safeName(name)}`;
}

export async function presign(env, method, key, { contentType, expires = 600, download = null } = {}) {
  const client = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: "s3",
    region: "auto",
  });
  const url = new URL(`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`);
  url.searchParams.set("X-Amz-Expires", String(expires));
  if (download) url.searchParams.set("response-content-disposition", `attachment; filename="${safeName(download)}"`);
  const headers = contentType ? { "Content-Type": contentType } : {};
  const signed = await client.sign(new Request(url, { method, headers }), {
    aws: { signQuery: true, allHeaders: true },
  });
  return signed.url;
}

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

// Every endpoint: thrown Responses (401, 403, 400) are returned as they are.
export const guard = (fn) => async (context) => {
  try { return await fn(context); }
  catch (e) { if (e instanceof Response) return e; return json({ ok: false, error: "Server error" }, 500); }
};
