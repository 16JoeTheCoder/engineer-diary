// In-memory mirror of every collection. Screens read synchronously from here;
// mutations update memory at once (so the UI never waits) and are handed to db.js.
import * as db from "./db.js";
import { uid, nowIso } from "./util.js";

export const SCHEMA_VERSION = 1;
const state = new Map(); // col -> Map(id -> doc)
const listeners = new Set();
let recorder = null;
let notifyQueued = false;

export const status = { state: "loading", error: null };

const colMap = (col) => { if (!state.has(col)) state.set(col, new Map()); return state.get(col); };

export function notify() {
  if (notifyQueued) return;
  notifyQueued = true;
  queueMicrotask(() => { notifyQueued = false; listeners.forEach((f) => f()); });
}
export const onChange = (f) => { listeners.add(f); return () => listeners.delete(f); };

// Called by db adapters
export function applyDocs(col, docs, removed = []) {
  const m = colMap(col);
  for (const d of docs) {
    const cur = m.get(d.id);
    if (!cur || !cur.updatedAt || !d.updatedAt || d.updatedAt >= cur.updatedAt) m.set(d.id, d);
  }
  for (const d of removed) m.delete(d.id ?? d);
  notify();
}
export const reset = () => { state.clear(); notify(); };
export function setStatus(s) { Object.assign(status, { error: null }, s); notify(); }

export const get = (col, id) => (id ? colMap(col).get(id) : undefined);
export const all = (col, { archived = false } = {}) => {
  const out = [];
  for (const d of colMap(col).values()) if (archived === "any" || !!d.archived === archived) out.push(d);
  return out;
};
export const where = (col, fn) => all(col).filter(fn);
export const snapshot = () => Object.fromEntries([...state].map(([c, m]) => [c, [...m.values()]]));

export function settings() {
  return get("settings", "main") || { id: "main", schemaVersion: SCHEMA_VERSION, theme: "auto", defaultBudgetIdr: 500000 };
}

// ---- writes ----
let writeError = null;
export const lastWriteError = () => writeError;

export async function commit(list) {
  if (!list.length) return;
  for (const { col, doc } of list) {
    if (recorder && !recorder.has(`${col}/${doc.id}`)) recorder.set(`${col}/${doc.id}`, { col, prev: get(col, doc.id) });
    colMap(col).set(doc.id, doc);
  }
  notify();
  try { await db.writeMany(list); writeError = null; }
  catch (e) { writeError = e.message || String(e); setStatus({ state: "error", error: writeError }); throw e; }
}

export function make(col, fields = {}) {
  const t = nowIso();
  return { id: uid(), createdAt: t, updatedAt: t, archived: false, ...fields };
}
export function add(col, fields) {
  const doc = make(col, fields);
  commit([{ col, doc }]).catch(() => {});
  return doc;
}
export function patchDoc(col, id, patch) {
  const cur = get(col, id);
  if (!cur) return null;
  return { ...cur, ...patch, updatedAt: nowIso() };
}
export function update(col, id, patch) {
  const doc = patchDoc(col, id, patch);
  if (doc) commit([{ col, doc }]).catch(() => {});
  return doc;
}
export function saveSettings(patch) {
  const cur = settings();
  const doc = { ...cur, ...patch, id: "main", updatedAt: nowIso(), createdAt: cur.createdAt || nowIso(), archived: false };
  commit([{ col: "settings", doc }]).catch(() => {});
}
export const archive = (col, id) => update(col, id, { archived: true });
export const restore = (col, id) => update(col, id, { archived: false });

// Record everything fn() commits so it can be undone in one step.
// Undo writes the old versions back with a fresh updatedAt; new docs are archived, never deleted.
export function undoable(fn) {
  const prevRec = recorder;
  recorder = new Map();
  let result;
  try { result = fn(); } finally {
    const rec = recorder;
    recorder = prevRec;
    result = { result, undo: () => {
      const t = nowIso();
      const list = [];
      for (const [key, { col, prev }] of rec) {
        const id = key.slice(col.length + 1);
        if (prev) list.push({ col, doc: { ...prev, updatedAt: t } });
        else { const cur = get(col, id); if (cur) list.push({ col, doc: { ...cur, archived: true, updatedAt: t } }); }
      }
      commit(list).catch(() => {});
    } };
  }
  return result;
}
