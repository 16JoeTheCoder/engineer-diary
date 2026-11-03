// POST { key, download } -> presigned GET, 5 minutes. ?download=1 also works.
import { requireUser } from "../../edge-lib/auth.js";
import { presign, json, guard } from "../../edge-lib/r2.js";

export const onRequestPost = guard(async ({ request, env }) => {
  const uid = await requireUser(request, env);
  const b = await request.json().catch(() => ({}));
  if (typeof b.key !== "string" || !b.key.startsWith(`${uid}/`)) return json({ ok: false, error: "Forbidden" }, 403);
  const download = b.download || new URL(request.url).searchParams.get("download") === "1";
  const url = await presign(env, "GET", b.key, { expires: 300, download: download ? b.key.split("/").pop() : null });
  return json({ url, expiresIn: 300 });
});
