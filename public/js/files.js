// Files (models, drawings, PDFs, large images): bytes go from the browser straight to the private R2 bucket
// with a short-lived presigned PUT. Fuse keeps only a metadata record per file. The app can never delete bytes.
import * as store from "./store.js";
import * as db from "./db.js";

import { normaliseFile, ACCEPT, MAX_FILE_BYTES, fmtSize } from "./file-types.js";
export { normaliseFile, ACCEPT, MAX_FILE_BYTES, fmtSize };

// In-memory upload state: id -> { pct, xhr, file, error }
export const live = new Map();
const pokes = () => store.notify();

async function api(path, body) {
  const token = await db.idToken();
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  if (!res.ok) {
    const msg = res.status === 401 ? "Sign in again: the session expired." : res.status === 403 ? "This account may not upload files." : `The server said ${res.status}.`;
    throw new Error(msg);
  }
  return res.json();
}

function put(id, url, headers, file, onPct) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers || {})) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onPct(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(xhr.status === 403 ? "Storage refused the upload (403). The link may have expired; retry." : `Upload failed (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error(navigator.onLine ? "Network error during upload. Retry." : "You are offline. Retry when the signal returns."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    live.get(id).xhr = xhr;
    xhr.send(file);
  });
}

// Create the record first (so a failed upload is visible), then upload, then verify.
export async function uploadFile(file, { projectId, section = "models-drawings", caption = "", entryId = null } = {}) {
  const { mime, kind } = normaliseFile(file.name, file.size);
  const rec = store.add("files", { projectId, entryId, section, kind, name: file.name, key: null, size: file.size, mime, caption, alt: "", figureOrder: null, thumbBlobId: null, status: "pending", deletedAt: null });
  await runUpload(rec.id, file);
  return rec;
}

export async function retry(id, file) {
  const f = file || live.get(id)?.file;
  if (!f) throw new Error("Pick the file again to retry.");
  store.update("files", id, { status: "pending" });
  await runUpload(id, f);
}

async function runUpload(id, file) {
  const rec = store.get("files", id);
  live.set(id, { pct: 0, file, xhr: null, error: null });
  pokes();
  try {
    const r = await api("/api/upload-url", { projectId: rec.projectId, fileId: id, name: file.name, size: file.size, contentType: rec.mime });
    store.update("files", id, { key: r.key });
    await put(id, r.url, r.headers, file, (pct) => { live.get(id).pct = pct; pokes(); });
    const v = await api("/api/file-verify", { key: r.key, size: file.size });
    if (!v.ok) throw new Error("The upload did not arrive complete. Retry.");
    store.update("files", id, { status: "ready", size: v.size });
    live.delete(id);
  } catch (e) {
    live.set(id, { ...(live.get(id) || {}), error: e.message, xhr: null });
    store.update("files", id, { status: "failed" });
  }
  pokes();
}

export function cancel(id) { live.get(id)?.xhr?.abort(); }

export async function openFile(id, { download = false } = {}) {
  const rec = store.get("files", id);
  if (!rec?.key) throw new Error("This file has not finished uploading.");
  const r = await api("/api/file-url", { key: rec.key, download });
  window.open(r.url, "_blank", "noopener");
}

// Failed uploads: failed, or pending for more than 24 hours.
export const stuck = (now = Date.now()) => store.all("files").filter((f) => !f.deletedAt && (f.status === "failed" || (f.status === "pending" && now - new Date(f.createdAt) > 864e5 && !live.has(f.id))));
