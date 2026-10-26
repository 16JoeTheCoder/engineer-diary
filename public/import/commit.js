// Turn a reviewed draft plan into records, undo an import, and export a project back to fuse.project/1.
// Pure: `mk(col, fields)` creates a doc with id/createdAt/updatedAt/archived; `d` holds current arrays.
import { SCHEMA, SKILL_ALIASES, normName } from "./validate.js";

const skillKey = (s) => { const n = normName(s); return SKILL_ALIASES[n] || n; };
const live = (a) => (a || []).filter((x) => !x.archived);
const todayStr = (now) => now.slice(0, 10);

// draft: the validated plan as edited in review. Items with include === false are skipped.
// parts[].useMatch (default true when match exists) links the part to the inventory item.
export function planToRecords(draft, d, mk, { rawText = "", now = new Date().toISOString() } = {}) {
  const out = []; // {col, doc}
  const created = [];
  const assigned = [];
  const batch = mk("importBatches", {});
  const bid = batch.id;
  const push = (col, fields) => {
    const doc = mk(col, { ...fields, importBatchId: bid });
    out.push({ col, doc });
    created.push({ col, id: doc.id });
    return doc;
  };
  const inc = (x) => x && x.include !== false;

  // track
  const trackName = (draft.project.track || "Robotics").trim();
  let track = live(d.tracks).find((t) => normName(t.name) === normName(trackName));
  if (!track) track = push("tracks", { name: trackName, color: "#FF6A1A" });

  const tasks = draft.tasks.filter(inc);
  const nextAction = (draft.project.nextAction || "").trim();
  const project = push("projects", {
    trackId: track.id,
    name: draft.project.name,
    summary: draft.project.summary || "",
    stage: "plan",
    stageDates: { plan: todayStr(now) },
    budgetCapIdr: draft.project.budgetCapIdr ?? null,
    aims: (draft.project.aims || []).filter((a) => String(a).trim()).map((text) => ({ text, met: null, reflection: "" })),
    nextAction: nextAction && !tasks.some((t) => normName(t.title) === normName(nextAction)) ? nextAction : "",
    risks: (draft.risks || []).filter(inc).map(({ text, mitigation }) => ({ text, mitigation: mitigation || "" })),
    closedAt: null,
  });

  // domains + skills
  const domains = live(d.domains);
  const domainFor = (name) => {
    const n = normName(name || "Unsorted");
    let dom = domains.find((x) => normName(x.name) === n);
    if (!dom) { dom = push("domains", { name: name || "Unsorted", order: domains.length }); domains.push(dom); }
    return dom.id;
  };
  const skillIds = new Map(); // key -> id
  for (const s of live(d.skills)) skillIds.set(skillKey(s.name), s.id);
  for (const s of (draft.skills || []).filter(inc)) {
    const key = skillKey(s.name);
    if (s.matchId && s.useMatch !== false) { skillIds.set(key, s.matchId); continue; }
    if (skillIds.has(key) && !s.matchId) continue;
    const doc = push("skills", { name: s.name, domainId: domainFor(s.domain), why: s.why || "", peakLevel: 0 });
    skillIds.set(key, doc.id);
  }
  const excludedSkills = new Set((draft.skills || []).filter((s) => !inc(s)).map((s) => skillKey(s.name)));

  // parts + BOM
  const partIds = new Map(); // ref -> partId
  for (const p of draft.parts.filter(inc)) {
    const useMatch = p.match && p.useMatch !== false;
    if (useMatch) {
      const cur = live(d.parts).find((x) => x.id === p.match.partId);
      if (cur) {
        partIds.set(p.ref, cur.id);
        if (cur.status === "spare" && !cur.projectId) {
          assigned.push({ partId: cur.id, prevStatus: cur.status, prevProjectId: cur.projectId || null });
          out.push({ col: "parts", doc: { ...cur, projectId: project.id, status: "in_use", updatedAt: now,
            statusLog: [...(cur.statusLog || []), { at: now, status: "in_use", note: `Assigned to ${project.name}` }] } });
        }
        push("bomLines", { projectId: project.id, partId: cur.id, name: cur.name, qty: p.qty, plannedPriceIdr: 0, fromInventory: true, links: [] });
        continue;
      }
    }
    const status = p.owned ? "in_use" : "planned";
    const part = push("parts", {
      name: p.name, category: p.category || "", qty: p.qty, status, projectId: project.id, links: [],
      lastPaidIdr: null, tags: p.tags || [], lostAt: null, lostFrom: null, source: "ai_import",
      priceIsEstimate: p.priceIdr != null, searchQuery: p.searchQuery || "", purpose: p.purpose || "",
      statusLog: [{ at: now, status }],
    });
    partIds.set(p.ref, part.id);
    push("bomLines", { projectId: project.id, partId: part.id, name: p.name, qty: p.qty,
      plannedPriceIdr: p.owned ? 0 : p.priceIdr ?? null, fromInventory: !!p.owned, links: [] });
  }

  // tasks
  const taskIds = new Map(tasks.map((t) => [t.ref, mk("tasks", {}).id]));
  tasks.forEach((t, i) => {
    const doc = mk("tasks", {
      projectId: project.id, stage: t.stage, title: t.title, detail: t.detail || "", estMinutes: t.estMinutes ?? null,
      order: i, done: !!t.done, doneAt: t.done ? now : null,
      partIds: (t.partRefs || []).map((r) => partIds.get(r)).filter(Boolean),
      skillIds: (t.skills || []).filter((n) => !excludedSkills.has(skillKey(n))).map((n) => skillIds.get(skillKey(n))).filter(Boolean),
      proofKinds: t.proof || [], dependsOn: (t.dependsOn || []).map((r) => taskIds.get(r)).filter(Boolean),
      entryId: null, importBatchId: bid,
    });
    doc.id = taskIds.get(t.ref);
    out.push({ col: "tasks", doc });
    created.push({ col: "tasks", id: doc.id });
  });

  for (const r of (draft.resources || []).filter(inc))
    push("resources", { title: r.title, url: r.url || "", type: r.type || "article", note: r.note || "", projectId: project.id, skillIds: [] });

  const counts = {};
  for (const c of created) counts[c.col] = (counts[c.col] || 0) + 1;
  Object.assign(batch, { rawText, schema: SCHEMA, counts, projectId: project.id, undone: false, created, assigned });
  out.push({ col: "importBatches", doc: batch });
  return { list: out, project, batch };
}

// Archive everything an import created and put assigned parts back. Soft only.
export function undoRecords(batch, d, now = new Date().toISOString()) {
  const out = [];
  const find = (col, id) => (d[col] || []).find((x) => x.id === id);
  for (const { col, id } of batch.created || []) {
    const cur = find(col, id);
    if (cur && !cur.archived) out.push({ col, doc: { ...cur, archived: true, updatedAt: now } });
  }
  for (const a of batch.assigned || []) {
    const cur = find("parts", a.partId);
    if (cur) out.push({ col: "parts", doc: { ...cur, status: a.prevStatus, projectId: a.prevProjectId, updatedAt: now,
      statusLog: [...(cur.statusLog || []), { at: now, status: a.prevStatus, note: "Import undone" }] } });
  }
  out.push({ col: "importBatches", doc: { ...batch, undone: true, updatedAt: now } });
  return out;
}

// Export a project's current plan, with edits and progress marks, in the same format.
export function projectToPlan(d, projectId) {
  const p = (d.projects || []).find((x) => x.id === projectId);
  if (!p) return null;
  const track = (d.tracks || []).find((t) => t.id === p.trackId);
  const lines = live(d.bomLines).filter((l) => l.projectId === projectId);
  const partById = new Map((d.parts || []).map((x) => [x.id, x]));
  const skillById = new Map((d.skills || []).map((x) => [x.id, x]));
  const domById = new Map((d.domains || []).map((x) => [x.id, x]));
  const stages = ["plan", "order", "build", "test", "document"];
  const tasks = live(d.tasks).filter((t) => t.projectId === projectId)
    .sort((a, b) => stages.indexOf(a.stage) - stages.indexOf(b.stage) || (a.order ?? 0) - (b.order ?? 0));
  const pref = new Map(), tref = new Map();
  lines.forEach((l, i) => pref.set(l.partId || l.id, `p${i + 1}`));
  tasks.forEach((t, i) => tref.set(t.id, `t${i + 1}`));
  const usedSkills = new Set(tasks.flatMap((t) => t.skillIds || []));
  const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== "" && v != null && !(Array.isArray(v) && !v.length)));
  return {
    schema: SCHEMA,
    project: clean({ name: p.name, track: track?.name, summary: p.summary, budgetCapIdr: p.budgetCapIdr, aims: (p.aims || []).map((a) => a.text), nextAction: p.nextAction }),
    parts: lines.map((l) => {
      const part = partById.get(l.partId);
      return clean({ ref: pref.get(l.partId || l.id), name: part?.name || l.name, category: part?.category, qty: l.qty,
        priceIdr: l.fromInventory ? 0 : l.plannedPriceIdr ?? null, searchQuery: part?.searchQuery, purpose: part?.purpose, owned: !!l.fromInventory });
    }),
    tasks: tasks.map((t) => clean({ ref: tref.get(t.id), stage: t.stage, title: t.title, detail: t.detail, estMinutes: t.estMinutes,
      partRefs: (t.partIds || []).map((id) => pref.get(id)).filter(Boolean), skills: (t.skillIds || []).map((id) => skillById.get(id)?.name).filter(Boolean),
      proof: t.proofKinds, dependsOn: (t.dependsOn || []).map((id) => tref.get(id)).filter(Boolean), done: t.done || undefined })),
    skills: [...usedSkills].map((id) => skillById.get(id)).filter(Boolean).map((s) => clean({ name: s.name, domain: domById.get(s.domainId)?.name, why: s.why })),
    resources: live(d.resources).filter((r) => r.projectId === projectId).map((r) => clean({ title: r.title, type: r.type, note: r.note, url: r.url })),
    risks: (p.risks || []).map((r) => clean(r)),
  };
}
