// POST { projectId, fileId, name, size, contentType } -> presigned PUT, 10 minutes.
import { requireUser } from "../../edge-lib/auth.js";
import { buildKey, presign, json, guard, MAX_FILE_BYTES, MIMES } from "../../edge-lib/r2.js";

export const onRequestPost = guard(async ({ request, env }) => {
  const uid = await requireUser(request, env);
  const b = await request.json().catch(() => ({}));
  const size = Number(b.size);
  if (!(size > 0) || size > MAX_FILE_BYTES) return json({ ok: false, error: "Size not allowed" }, 400);
  if (!MIMES.has(b.contentType)) return json({ ok: false, error: "Type not allowed" }, 400);
  const key = buildKey(uid, b.projectId, b.fileId, b.name);
  const url = await presign(env, "PUT", key, { contentType: b.contentType, expires: 600 });
  return json({ key, url, headers: { "Content-Type": b.contentType }, expiresIn: 600 });
});
