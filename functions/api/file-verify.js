// POST { key, size } -> HEAD the object through the FILES binding and confirm the size.
import { requireUser } from "../../edge-lib/auth.js";
import { json, guard, MAX_FILE_BYTES } from "../../edge-lib/r2.js";

export const onRequestPost = guard(async ({ request, env }) => {
  const uid = await requireUser(request, env);
  const b = await request.json().catch(() => ({}));
  if (typeof b.key !== "string" || !b.key.startsWith(`${uid}/`)) return json({ ok: false, error: "Forbidden" }, 403);
  const head = await env.FILES.head(b.key);
  if (!head) return json({ ok: false, error: "Not found" }, 404);
  const ok = head.size <= MAX_FILE_BYTES && (b.size == null || head.size === Number(b.size));
  return json({ ok, size: head.size });
});
