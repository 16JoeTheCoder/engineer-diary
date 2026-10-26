// Domain mutations. Everything soft: archive, Lost, Retired. Undo where an action looks destructive.
import * as store from "./store.js";
import * as db from "./db.js";
import { nowIso, today, norm, uid, download } from "./util.js";
import { skillLevels, STAGES } from "./derive.js";
import { toast } from "./ui.js";
import { buildBackup, migrate, mergePlan, decodeBlobs } from "./backup.js";
import { planToRecords, undoRecords } from "../import/commit.js";

export const PART_STATUSES = ["wishlist", "planned", "ordered", "arrived", "tested", "in_use", "spare", "lost", "retired"];
export const OWNED = new Set(["arrived", "tested", "in_use", "spare"]);
export const statusLabel = (s) => ({ in_use: "In use" }[s] || (s ? s[0].toUpperCase() + s.slice(1) : ""));

let cache = null;
store.onChange(() => { cache = null; });
export const data = () => (cache ||= store.snapshot());
export const levels = () => skillLevels(data());

// ---------- parts ----------
export function setPartStatus(id, status, extra = {}) {
  const p = store.get("parts", id);
  if (!p || p.status === status) return;
  const patch = { status, statusLog: [...(p.statusLog || []), { at: nowIso(), status }], ...extra };
  if (status === "spare" && !("projectId" in extra)) patch.projectId = null;
  store.update("parts", id, patch);
}

export function markLost(id) {
  const p = store.get("parts", id);
  if (!p || p.status === "lost") return;
  const { undo } = store.undoable(() => store.update("parts", id, {
    status: "lost", lostAt: nowIso(), lostFrom: { status: p.status, projectId: p.projectId || null }, projectId: null,
    statusLog: [...(p.statusLog || []), { at: nowIso(), status: "lost" }],
  }));
  toast(`${p.name} moved to Lost.`, { undo });
}

export function restorePart(id) {
  const p = store.get("parts", id);
  if (!p || p.status !== "lost") return;
  const back = p.lostFrom || { status: "spare", projectId: null };
  const { undo } = store.undoable(() => store.update("parts", id, {
    status: back.status, projectId: back.projectId || null, lostAt: null, lostFrom: null,
    statusLog: [...(p.statusLog || []), { at: nowIso(), status: back.status, note: "Found" }],
  }));
  toast(`${p.name} is back: ${statusLabel(back.status)}.`, { undo });
}

export function findOrCreatePart(name, fields = {}) {
  const key = norm(name);
  const hit = store.all("parts").find((p) => norm(p.name) === key && p.status !== "retired");
  if (hit) return { part: hit, created: false };
  const status = fields.status || "wishlist";
  return { part: store.add("parts", { name: name.trim(), category: "", qty: 1, status, projectId: null, links: [], lastPaidIdr: null, tags: [],
    lostAt: null, lostFrom: null, source: "manual", priceIsEstimate: false, searchQuery: "", statusLog: [{ at: nowIso(), status }], ...fields }), created: true };
}

// One purchase writes: a purchase record (the only price history), the part's last price and status, and a purchase entry.
export function recordPurchase({ partId, name, projectId = null, priceIdr, qty = 1, shop = "", date = today(), note = "" }, { withEntry = true } = {}) {
  return store.undoable(() => {
    let part = partId ? store.get("parts", partId) : findOrCreatePart(name, { status: "ordered", projectId }).part;
    const purchase = store.add("purchases", { partId: part.id, projectId: projectId || part.projectId || null, priceIdr: priceIdr ?? 0, qty: +qty || 1, shop, date });
    const status = ["wishlist", "planned"].includes(part.status) ? "ordered" : part.status;
    part = store.get("parts", part.id);
    store.update("parts", part.id, {
      lastPaidIdr: priceIdr ?? part.lastPaidIdr, status, projectId: part.projectId || projectId || null, priceIsEstimate: false,
      qty: part.status === "wishlist" || part.status === "planned" ? Math.max(part.qty || 1, +qty || 1) : part.qty,
      statusLog: status !== part.status ? [...(part.statusLog || []), { at: nowIso(), status }] : part.statusLog,
    });
    const entry = withEntry && store.add("entries", { projectId: purchase.projectId, type: "purchase", title: `Bought ${part.name}`,
      fields: { partId: part.id, qty: +qty || 1, priceIdr, shop, date, purchaseId: purchase.id }, bodyMd: note, tags: [], partIds: [part.id], skillIds: [], sessionSec: 0 });
    return { part, purchase, entry };
  });
}

// ---------- projects ----------
export function createProject(name, fields = {}) {
  let track = store.all("tracks")[0];
  if (!track) track = store.add("tracks", { name: "Robotics", color: "#FF6A1A" });
  const p = store.add("projects", { trackId: track.id, name, summary: "", stage: "plan", stageDates: { plan: today() }, budgetCapIdr: store.settings().defaultBudgetIdr || null,
    aims: [], nextAction: "", risks: [], closedAt: null, ...fields });
  store.saveSettings({ activeProjectId: p.id });
  return p;
}

export function setStage(projectId, stage) {
  const p = store.get("projects", projectId);
  if (!p || p.stage === stage) return;
  const { undo } = store.undoable(() => store.update("projects", projectId, { stage, stageDates: { ...(p.stageDates || {}), [stage]: p.stageDates?.[stage] || today() } }));
  toast(`Stage: ${stage}.`, { undo, ms: 5000 });
}

export function activeProject() {
  const s = store.settings();
  const open = store.all("projects").filter((p) => !p.closedAt);
  return open.find((p) => p.id === s.activeProjectId) || open.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] || null;
}

// ---------- tasks ----------
const stageTasks = (projectId, stage) => store.all("tasks").filter((t) => t.projectId === projectId && t.stage === stage).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

export function addTask(projectId, stage, title) {
  const list = stageTasks(projectId, stage);
  return store.add("tasks", { projectId, stage, title, detail: "", estMinutes: null, order: (list.at(-1)?.order ?? -1) + 1, done: false, doneAt: null,
    partIds: [], skillIds: [], proofKinds: [], dependsOn: [], entryId: null });
}

export function toggleTask(id) {
  const t = store.get("tasks", id);
  if (!t) return null;
  const done = !t.done;
  return store.undoable(() => {
    store.update("tasks", id, { done, doneAt: done ? nowIso() : null });
    const p = store.get("projects", t.projectId);
    if (done && p?.nextAction && norm(p.nextAction) === norm(t.title)) store.update("projects", p.id, { nextAction: "" });
    return done;
  });
}

export function moveTask(id, dir) {
  const t = store.get("tasks", id);
  const list = stageTasks(t.projectId, t.stage);
  const i = list.findIndex((x) => x.id === id), j = i + dir;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  const now = nowIso();
  store.commit(list.map((x, k) => ({ col: "tasks", doc: { ...x, order: k, updatedAt: now } })).filter((x, k) => list[k].order !== k || k === i || k === j)).catch(() => {});
}

export function archiveWithUndo(col, id, label) {
  const { undo } = store.undoable(() => store.archive(col, id));
  toast(`${label} archived.`, { undo });
}

// ---------- BOM ----------
export function addBomLine(projectId, name) {
  const key = norm(name);
  const owned = store.all("parts").find((p) => norm(p.name) === key && OWNED.has(p.status));
  return store.undoable(() => {
    if (owned) {
      if (owned.status === "spare" && !owned.projectId) setPartStatus(owned.id, "in_use", { projectId });
      return store.add("bomLines", { projectId, partId: owned.id, name: owned.name, qty: 1, plannedPriceIdr: 0, fromInventory: true, links: [] });
    }
    const { part } = findOrCreatePart(name, { status: "planned", projectId });
    if (!part.projectId) store.update("parts", part.id, { projectId });
    return store.add("bomLines", { projectId, partId: part.id, name: part.name, qty: 1, plannedPriceIdr: part.lastPaidIdr ?? null, fromInventory: false, links: [] });
  });
}

// ---------- entries ----------
// draft: { id?, type, projectId, title, fields, bodyMd, tags, partIds, skillIds, resourceIds, sessionSec, taskId, evidence: [...] }
export async function saveEntry(draft) {
  const existing = draft.id && store.get("entries", draft.id);
  const t = nowIso();
  const entry = {
    ...(existing || { id: uid(), createdAt: draft.startedAt || t, archived: false }),
    projectId: draft.projectId || null, type: draft.type, title: (draft.title || "").trim(), fields: draft.fields || {},
    bodyMd: draft.bodyMd || "", tags: draft.tags || [], partIds: draft.partIds || [], skillIds: draft.skillIds || [], resourceIds: draft.resourceIds || [],
    sessionSec: Math.round(draft.sessionSec || 0), taskId: draft.taskId || null, updatedAt: t,
  };
  if (draft.type === "purchase" && !existing && draft.purchase?.name) {
    const pu = draft.purchase;
    const { result } = recordPurchase({ partId: pu.partId || null, name: pu.name, projectId: entry.projectId, priceIdr: pu.priceIdr, qty: pu.qty, shop: pu.shop, date: pu.date }, { withEntry: false });
    entry.fields = { ...entry.fields, partId: result.part.id, qty: result.purchase.qty, priceIdr: result.purchase.priceIdr, shop: result.purchase.shop, date: result.purchase.date, purchaseId: result.purchase.id };
    entry.partIds = [...new Set([...entry.partIds, result.part.id])];
    if (!entry.title) entry.title = `Bought ${result.part.name}`;
  }
  const list = [{ col: "entries", doc: entry }];
  for (const ev of draft.evidence || []) {
    if (ev.saved) continue;
    const doc = { id: ev.id, createdAt: t, updatedAt: t, archived: false, entryId: entry.id, kind: ev.kind, caption: ev.caption || "",
      value: ev.value ?? "", unit: ev.unit || "", text: ev.text || "", blobId: null, thumbId: null, bytes: 0 };
    if (ev.kind === "photo" && ev.full) {
      doc.blobId = `${ev.id}-f`; doc.thumbId = `${ev.id}-t`;
      doc.bytes = ev.full.length + ev.thumb.length;
      await db.putBlob({ id: doc.blobId, evidenceId: ev.id, kind: "full", mime: "image/jpeg", bytes: ev.full.length, data: ev.full });
      await db.putBlob({ id: doc.thumbId, evidenceId: ev.id, kind: "thumb", mime: "image/jpeg", bytes: ev.thumb.length, data: ev.thumb });
    }
    list.push({ col: "evidence", doc });
  }
  if (draft.taskId) {
    const task = store.get("tasks", draft.taskId);
    if (task) list.push({ col: "tasks", doc: { ...task, entryId: entry.id, done: true, doneAt: task.doneAt || t, updatedAt: t } });
  }
  await store.commit(list).catch(() => {});
  return entry;
}

// ---------- plan import ----------
export function importPlan(draft, rawText) {
  const { list, project, batch } = planToRecords(draft, data(), store.make, { rawText });
  store.commit(list).catch(() => {});
  store.saveSettings({ activeProjectId: project.id });
  return { project, batch };
}
export function undoImport(batchId) {
  const b = store.get("importBatches", batchId);
  if (!b || b.undone) return;
  store.commit(undoRecords(b, store.snapshot())).catch(() => {});
  toast("Import undone. Everything it created is in the Archive.");
}

// ---------- skill peaks: a level never goes down ----------
export function reconcilePeaks() {
  const lv = levels();
  const list = [];
  for (const s of store.all("skills")) {
    const l = lv.get(s.id);
    if (l && l.computed > (s.peakLevel || 0)) list.push({ col: "skills", doc: { ...s, peakLevel: l.computed, updatedAt: nowIso() } });
  }
  if (list.length) store.commit(list).catch(() => {});
}

// ---------- backup ----------
export async function exportBackup() {
  const blobs = await db.allBlobs();
  const file = buildBackup(store.snapshot(), blobs);
  download(`fuse-backup-${today()}.json`, JSON.stringify(file));
  store.saveSettings({ lastBackupAt: nowIso() });
  toast(`Backup saved: ${Object.values(file.collections).reduce((n, a) => n + a.length, 0)} records, ${blobs.length / 2 | 0} photos.`, { ms: 5000 });
}

export async function importBackup(text) {
  const file = migrate(JSON.parse(text));
  const plan = mergePlan(file, store.snapshot());
  const blobs = decodeBlobs(file);
  for (const b of blobs) await db.putBlob(b);
  for (let i = 0; i < plan.list.length; i += 400) await store.commit(plan.list.slice(i, i + 400));
  return { ...plan, photos: blobs.length };
}

export function storageEstimate() {
  let bytes = 0;
  for (const docs of Object.values(store.snapshot())) for (const d of docs) bytes += JSON.stringify(d).length + (d.bytes || 0);
  return bytes;
}

export const STAGE_LIST = STAGES;
