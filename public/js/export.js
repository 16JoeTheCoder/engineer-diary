// Export document model. Fuse assembles Josef's words; it never rewrites, summarises or "improves" them. No AI anywhere.
// buildDocument(d, projectId, options) -> { meta, glance, chapters, appendix, provenance }. Pure, tested with golden files.
import { projectCosts, skillLevels, lineTotal, PROOF_KINDS, judge } from "./derive.js";
import { projectDefaults } from "./backup.js";

export const DEFAULTS = { costs: true, photos: true, fails: true, reflections: false, parked: false, files: true, variant: "portfolio" };
const live = (a) => (a || []).filter((x) => !x.archived);
const day = (iso) => (iso ? String(iso).slice(0, 10) : "");
const txt = (s) => String(s ?? "").trim();
const paras = (s) => txt(s).split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
const lines = (s) => txt(s).split(/\n|,(?=\s)/).map((x) => x.trim()).filter(Boolean);
export const rpText = (n) => (n == null ? "unpriced" : `Rp ${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`);
export const slug = (s) => String(s || "project").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";

export function buildDocument(d, projectId, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const now = o.now || new Date().toISOString();
  const p = projectDefaults((d.projects || []).find((x) => x.id === projectId));
  if (!p?.id) return null;
  const track = (d.tracks || []).find((t) => t.id === p.trackId);
  const all = live(d.entries).filter((e) => e.projectId === p.id).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const entries = all.filter((e) => !e.parked);
  const ev = live(d.evidence);
  const evFor = (id) => ev.filter((x) => x.entryId === id);
  const costs = projectCosts(d, p.id, p);
  const levels = skillLevels(d);
  const files = live(d.files).filter((f) => f.projectId === p.id && !f.deletedAt && f.status === "ready");
  const m = p.problem.successMeasure;
  const r = p.testResult || {};
  const met = judge(m, r.value);
  const verdictText = met == null ? "Not judged" : met ? "Met" : "Not met";

  // figures, numbered in document order as chapters are built
  const figures = [];
  const figure = (x, entry) => {
    const n = figures.length + 1;
    const f = { type: "figure", n, caption: txt(x.caption) || txt(entry?.title) || `Photo from ${day(entry?.createdAt)}`, alt: txt(x.alt) || txt(x.caption) || txt(entry?.title) || "Project photo", blobId: x.blobId || null, path: `assets/fig-${String(n).padStart(2, "0")}.jpg`, date: day(entry?.createdAt) };
    figures.push(f);
    return f;
  };
  const photos = (e) => (o.photos ? evFor(e.id).filter((x) => x.kind === "photo" && x.blobId).map((x) => figure(x, e)) : []);
  const measures = (e) => evFor(e.id).filter((x) => x.kind === "measurement");
  const ref = (figs) => (figs.length ? ` (${figs.map((f) => `Figure ${f.n}`).join(", ")})` : "");
  const of = (types) => entries.filter((e) => types.includes(e.type));

  const ch = [];
  const chapter = (id, title, blocks) => ch.push({ id, title, blocks: blocks.filter(Boolean) });

  chapter("ch-1", "Problem", [
    p.problem.statement && { type: "p", text: txt(p.problem.statement) },
    p.problem.forWhom && { type: "p", text: `For: ${txt(p.problem.forWhom)}` },
    m.text && { type: "p", text: `Success measure: ${txt(m.text)}${m.value != null && m.value !== "" ? ` (${m.op} ${m.value} ${txt(m.unit)})`.replace(/ \)$/, ")") : ""}` },
    !p.problem.statement && p.summary && { type: "p", text: txt(p.summary) },
  ]);
  chapter("ch-2", "Study", of(["study"]).flatMap((e) => {
    const f = e.fields || {};
    const figs = photos(e);
    return [{ type: "h", text: txt(e.title) || txt(f.concept) }, (f.concept || f.whyItMatters) && { type: "p", text: [txt(f.concept), txt(f.whyItMatters)].filter(Boolean).join(" ") + ref(figs) },
      f.equations && { type: "equation", text: txt(f.equations) }, f.workedExample && { type: "equation", text: txt(f.workedExample) }, f.howToTest && { type: "p", text: `How I would test this: ${txt(f.howToTest)}` }, ...figs];
  }));
  chapter("ch-3", "Design", [
    ...of(["decision", "design"]).flatMap((e) => {
      const f = e.fields || {};
      const figs = photos(e);
      return [{ type: "decision", date: day(e.createdAt), title: txt(e.title), context: txt(f.question), options: lines(f.options), choice: txt(f.choice) || txt(e.title), why: txt(f.why || e.bodyMd) + ref(figs), changeMyMind: txt(f.changeMyMind) }, ...figs];
    }),
    files.filter((f) => f.section === "models-drawings").length && { type: "p", text: `Models and drawings: ${files.filter((f) => f.section === "models-drawings").map((f) => f.name + (f.caption ? ` (${txt(f.caption)})` : "")).join("; ")}.` },
  ]);
  const bom = live(d.bomLines).filter((l) => l.projectId === p.id);
  const partName = (id, fb) => (d.parts || []).find((x) => x.id === id)?.name || fb;
  chapter("ch-4", "Plan and order", [
    bom.length && { type: "table", head: o.costs ? ["Part", "Qty", "Planned"] : ["Part", "Qty"], rows: bom.map((l) => [partName(l.partId, l.name), String(l.qty), ...(o.costs ? [l.fromInventory ? "Rp 0 (owned)" : rpText(l.plannedPriceIdr == null ? null : lineTotal(l))] : [])]) },
    o.costs && { type: "p", text: `Planned ${rpText(costs.planned)}, spent ${rpText(costs.actual)}${costs.cap ? `, against a cap of ${rpText(costs.cap)}` : ""}.` },
  ]);
  chapter("ch-5", "Build", of(["build", ...(o.fails ? ["fail"] : [])]).flatMap((e) => {
    const figs = photos(e);
    const f = e.fields || {};
    const body = e.type === "fail" ? [txt(f.symptom), f.fix && `Fix: ${txt(f.fix)}`].filter(Boolean).join(" ") : txt(e.bodyMd);
    return [{ type: "p", date: day(e.createdAt), lead: txt(e.title), text: body + ref(figs) }, ...figs];
  }));
  const exps = of(["experiment"]);
  chapter("ch-6", "Test", [
    m.text && { type: "p", text: `The measure: ${txt(m.text)}${m.value != null && m.value !== "" ? ` (${m.op} ${m.value} ${txt(m.unit)})` : ""}.` },
    r.value != null && r.value !== "" && { type: "result", value: String(r.value), unit: txt(m.unit), verdict: verdictText, note: txt(r.note) },
    ...exps.flatMap((e) => {
      const f = e.fields || {};
      const ms = measures(e);
      const figs = photos(e);
      return [{ type: "p", date: day(e.createdAt), lead: txt(e.title), text: [f.hypothesis && `Expected: ${txt(f.hypothesis)}`, f.result && `Result: ${txt(f.result)}`].filter(Boolean).join(" ") + ref(figs) },
        ms.length && { type: "table", head: ["Measurement", "Value", "Unit"], rows: ms.map((x) => [txt(x.caption), String(x.value), txt(x.unit)]) }, ...figs];
    }),
  ]);
  chapter("ch-7", "Write-up", [
    ...paras(p.writeup).map((t) => (t.startsWith("## ") ? { type: "h", text: t.slice(3).split("\n")[0] } : { type: "p", text: t })),
    ...(o.reflections ? of(["reflect"]).map((e) => ({ type: "p", date: day(e.createdAt), lead: txt(e.title), text: txt(e.bodyMd) })) : []),
  ]);

  const usedSkills = new Set(entries.flatMap((e) => e.skillIds || []));
  const skills = live(d.skills).filter((s) => usedSkills.has(s.id)).map((s) => ({ name: s.name, level: levels.get(s.id)?.level || 0, proofs: levels.get(s.id)?.proofCount || 0 }));
  const first = day(all[0]?.createdAt), last = day(all.at(-1)?.createdAt);
  const resources = live(d.resources).filter((x) => x.projectId === p.id || entries.some((e) => (e.resourceIds || []).includes(x.id)));

  const appendix = {
    fails: o.fails ? of(["fail"]).map((e) => ({ date: day(e.createdAt), title: txt(e.title), symptom: txt(e.fields?.symptom), cause: txt(e.fields?.rootCause || e.fields?.hypothesis), fix: txt(e.fields?.fix) })) : [],
    parts: o.costs ? live(d.purchases).filter((x) => x.projectId === p.id).sort((a, b) => String(a.date).localeCompare(String(b.date))).map((x) => ({ date: x.date, name: partName(x.partId, "part"), qty: x.qty, price: rpText(x.priceIdr), shop: txt(x.shop) })) : bom.map((l) => ({ name: partName(l.partId, l.name), qty: l.qty })),
    references: resources.map((x) => ({ title: txt(x.title), type: x.type, url: txt(x.url), note: txt(x.note) })),
    files: o.files ? files.map((f) => ({ name: f.name, size: f.size, section: f.section, caption: txt(f.caption) })) : [],
    log: o.variant === "full" ? entries.map((e) => ({ date: day(e.createdAt), type: e.type, title: txt(e.title), proofs: evFor(e.id).filter((x) => PROOF_KINDS.has(x.kind)).length })) : [],
    parked: o.parked ? all.filter((e) => e.parked).map((e) => ({ date: day(e.createdAt), text: txt(e.title) })) : [],
  };
  const provenance = { exported: day(now), entries: all.length, first, last };
  return {
    meta: { title: p.name, track: track?.name || "", exported: day(now), entries: all.length, first_entry: first, last_entry: last, budget_cap_idr: p.budgetCapIdr || null,
      spent_idr: o.costs ? costs.actual : null, success_measure: m.text ? `${txt(m.text)}${m.value != null && m.value !== "" ? ` (${m.op} ${m.value} ${txt(m.unit)})` : ""}` : "",
      result: r.value != null && r.value !== "" ? `${r.value} ${txt(m.unit)} (${verdictText})`.replace("  ", " ") : "", skills, variant: o.variant },
    glance: { problem: txt(p.problem.statement) || txt(p.summary), result: r.value != null && r.value !== "" ? { value: String(r.value), unit: txt(m.unit), verdict: verdictText } : null,
      measure: txt(m.text), hero: figures[0] || null, skills, cost: o.costs ? rpText(costs.actual) : null, dates: { first, last } },
    chapters: ch, figures, appendix, provenance,
  };
}

export const provenanceLine = (pv) => `Exported ${pv.exported} from ${pv.entries} dated entries, ${pv.first || "none"} to ${pv.last || "none"}. Dates are the days the entries were created in Fuse.`;
