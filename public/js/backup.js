// Backups: one JSON file with every collection and every photo. Restore merges by id and
// never overwrites a doc whose updatedAt is newer than the file's. Old files are migrated forward.
import { b64FromBytes, bytesFromB64 } from "./util.js";

export const BACKUP_FORMAT = "fuse.backup";
export const SCHEMA_VERSION = 1;

// Each migration takes a file at version n and returns it at version n + 1.
// Add one here for every schema change, so old backups always import.
export const MIGRATIONS = {
  // 1: (file) => { ...; file.schemaVersion = 2; return file; },
};

export function buildBackup(collections, blobs, now = new Date().toISOString()) {
  return {
    format: BACKUP_FORMAT,
    app: "Fuse",
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now,
    collections,
    blobs: blobs.map(({ data, ...meta }) => ({ ...meta, data: b64FromBytes(data instanceof Uint8Array ? data : new Uint8Array(data)) })),
  };
}

export function migrate(file) {
  if (!file || file.format !== BACKUP_FORMAT) throw new Error("This is not a Fuse backup file.");
  let v = file.schemaVersion || 1;
  if (v > SCHEMA_VERSION) throw new Error(`This backup is from a newer version of Fuse (schema ${v}). Update the app first.`);
  while (v < SCHEMA_VERSION) { file = MIGRATIONS[v](file); v = file.schemaVersion; }
  return file;
}

// current: { col: [docs] }. Returns { list: [{col, doc}], skipped, added, updated }.
export function mergePlan(file, current) {
  const list = [];
  let added = 0, updated = 0, skipped = 0;
  for (const [col, docs] of Object.entries(file.collections || {})) {
    const byId = new Map((current[col] || []).map((d) => [d.id, d]));
    for (const doc of docs || []) {
      if (!doc || !doc.id) continue;
      const cur = byId.get(doc.id);
      if (!cur) { list.push({ col, doc }); added++; }
      else if ((doc.updatedAt || "") > (cur.updatedAt || "")) { list.push({ col, doc }); updated++; }
      else skipped++;
    }
  }
  return { list, added, updated, skipped };
}

export const decodeBlobs = (file) => (file.blobs || []).map(({ data, ...meta }) => ({ ...meta, data: bytesFromB64(data) }));
