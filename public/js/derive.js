// Pure rules: skill levels, cost figures, next action. No DOM, no storage, so they are unit-tested.
// `d` is a plain object of arrays per collection (non-archived docs only).

export const STAGES = ["plan", "order", "build", "test", "document"];
export const PROOF_KINDS = new Set(["photo", "measurement", "snippet"]);
export const LEVEL_RULES = [
  "One note or resource tagged to the skill",
  "A proof (photo, measurement or snippet) on an entry tagged to the skill",
  "Proof from a second, different project",
  "Proof on a fail entry that records a fix",
  "An entry tagged taught that explains the skill to someone else",
];

const live = (arr) => (arr || []).filter((x) => !x.archived);

export function proofByEntry(evidence) {
  const m = new Map();
  for (const e of live(evidence)) if (PROOF_KINDS.has(e.kind)) m.set(e.entryId, (m.get(e.entryId) || 0) + 1);
  return m;
}

// Returns Map(skillId -> { level, computed, rungs[5], proofCount, proofEntryIds, projectIds })
export function skillLevels(d) {
  const entries = live(d.entries);
  const proofs = proofByEntry(d.evidence);
  const out = new Map();
  for (const s of live(d.skills)) {
    const tagged = entries.filter((e) => (e.skillIds || []).includes(s.id));
    const proofEntries = tagged.filter((e) => proofs.get(e.id));
    const projectIds = new Set(proofEntries.map((e) => e.projectId).filter(Boolean));
    const rungs = [
      tagged.length > 0 || live(d.resources).some((r) => (r.skillIds || []).includes(s.id)),
      proofEntries.length > 0,
      projectIds.size >= 2,
      proofEntries.some((e) => e.type === "fail" && String(e.fields?.fix || "").trim()),
      tagged.some((e) => (e.tags || []).includes("taught")),
    ];
    let computed = 0;
    while (computed < 5 && rungs[computed]) computed++;
    out.set(s.id, {
      computed,
      level: Math.max(computed, s.peakLevel || 0), // a level never goes down
      rungs,
      proofCount: proofEntries.reduce((n, e) => n + proofs.get(e.id), 0),
      proofEntryIds: proofEntries.map((e) => e.id),
      projectIds,
    });
  }
  return out;
}

// Levels an unsaved draft would earn: Map(skillId -> { before, after }) for skills that change.
export function pendingLevels(d, draftEntry, draftEvidence) {
  const before = skillLevels(d);
  const id = draftEntry.id || "__draft__";
  const entry = { ...draftEntry, id, archived: false };
  const evidence = (draftEvidence || []).map((e) => ({ ...e, entryId: id, archived: false }));
  const after = skillLevels({
    ...d,
    entries: [...live(d.entries).filter((e) => e.id !== id), entry],
    evidence: [...live(d.evidence).filter((e) => !evidence.some((x) => x.id === e.id)), ...evidence],
  });
  const out = new Map();
  for (const [sid, a] of after) {
    const b = before.get(sid);
    if (a.level > (b?.level || 0)) out.set(sid, { before: b?.level || 0, after: a.level });
  }
  return out;
}

export const lineTotal = (l) => (l.fromInventory ? 0 : (l.qty || 0) * (l.plannedPriceIdr || 0));

export function projectCosts(d, projectId, project) {
  const lines = live(d.bomLines).filter((l) => l.projectId === projectId);
  const planned = lines.reduce((n, l) => n + lineTotal(l), 0);
  const actual = live(d.purchases).filter((p) => p.projectId === projectId).reduce((n, p) => n + (p.priceIdr || 0) * (p.qty || 1), 0);
  const proofs = proofByEntry(d.evidence);
  const proven = new Set();
  for (const e of live(d.entries)) if (e.projectId === projectId && proofs.get(e.id)) (e.skillIds || []).forEach((s) => proven.add(s));
  const cap = project?.budgetCapIdr || null;
  return {
    planned, actual, variance: actual - planned, cap,
    unpriced: lines.filter((l) => !l.fromInventory && l.plannedPriceIdr == null).length,
    overCap: cap ? planned > cap : false,
    provenSkills: proven.size,
    costPerSkill: proven.size ? Math.round(actual / proven.size) : null,
  };
}

export function overallCostPerSkill(d) {
  const actual = live(d.purchases).reduce((n, p) => n + (p.priceIdr || 0) * (p.qty || 1), 0);
  const proofs = proofByEntry(d.evidence);
  const proven = new Set();
  for (const e of live(d.entries)) if (proofs.get(e.id)) (e.skillIds || []).forEach((s) => proven.add(s));
  return { actual, proven: proven.size, costPerSkill: proven.size ? Math.round(actual / proven.size) : null };
}

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.createdAt).localeCompare(String(b.createdAt));

export function projectTasks(d, projectId) {
  return live(d.tasks).filter((t) => t.projectId === projectId).sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) || byOrder(a, b));
}

export function nextAction(d, project) {
  if (!project) return { text: "", source: "none" };
  if (project.nextAction && String(project.nextAction).trim()) return { text: project.nextAction, source: "override" };
  const tasks = projectTasks(d, project.id);
  const done = new Set(tasks.filter((t) => t.done).map((t) => t.id));
  const ready = (t) => !t.done && (t.dependsOn || []).every((x) => done.has(x) || !tasks.some((y) => y.id === x));
  const t = tasks.find((t) => t.stage === project.stage && ready(t)) || tasks.find(ready);
  return t ? { text: t.title, taskId: t.id, source: "task" } : { text: "", source: "none" };
}

export function proofsByDay(d) {
  const entries = new Map(live(d.entries).map((e) => [e.id, e]));
  const m = new Map();
  for (const ev of live(d.evidence)) {
    if (!PROOF_KINDS.has(ev.kind)) continue;
    const at = entries.get(ev.entryId)?.createdAt || ev.createdAt;
    if (!at) continue;
    const day = localDay(at);
    m.set(day, (m.get(day) || 0) + 1);
  }
  return m;
}
const pad = (n) => String(n).padStart(2, "0");
export const localDay = (iso) => { const x = new Date(iso); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };

export const heatIndex = (n) => (n <= 0 ? 0 : n >= 5 ? 5 : n);
