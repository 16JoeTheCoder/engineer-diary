// Exports: project Markdown, BOM CSV, and the report brief (role prompt + structured Markdown).
// Pure: takes `d` (arrays per collection). No AI is ever called from the app.
import { projectCosts, skillLevels, STAGES, lineTotal } from "./derive.js";

const live = (a) => (a || []).filter((x) => !x.archived);
const rp = (n) => (n == null ? "unpriced" : `Rp ${Math.round(n).toLocaleString("id-ID")}`);
const day = (iso) => (iso ? iso.slice(0, 10) : "");
const one = (s) => String(s || "").replace(/\s+/g, " ").trim();
const cell = (s) => one(s).replace(/\|/g, "\\|");

export const STYLES = {
  school: {
    label: "School project",
    prompt: "You are an experienced secondary school science and technology teacher. Write a school project report from the brief below for a student-level reader. Use these sections: Introduction and aims, Materials and costs, Method, Results, Problems and how I solved them, Evaluation, What I learned. Keep the language clear and honest. Use first person.",
  },
  portfolio: {
    label: "Portfolio",
    prompt: "You are a portfolio editor for engineers. Turn the brief below into a portfolio case study a reviewer can read in three minutes. Lead with the outcome, then the problem, the build, the hardest failure and its root cause, the evidence, and the skills it proves. Use short sections and concrete numbers from the brief.",
  },
  university: {
    label: "University application",
    prompt: "You are a university admissions advisor for engineering programmes. From the brief below, write a project description suitable for a university application or personal statement supplement. Show curiosity, persistence and independent learning through specific moments in the brief, especially failures, root causes and measurements. Keep it under 600 words. Do not exaggerate.",
  },
  technical: {
    label: "Technical report",
    prompt: "You are a senior hardware engineer writing a technical report. From the brief below, write a concise technical report with: Abstract, Requirements (from the aims), System design, Bill of materials with costs, Implementation, Test method and results (use the measurements with units), Failure analysis (symptom, hypothesis, fix, root cause), Conclusions, Next steps. Use SI units and tables where useful.",
  },
};

const RULES = "Use only facts from the brief. Do not invent measurements, prices or results. Where the brief has gaps, say so plainly instead of filling them. Write in English.";

function gather(d, projectId) {
  const project = (d.projects || []).find((p) => p.id === projectId);
  const track = (d.tracks || []).find((t) => t.id === project?.trackId);
  const entries = live(d.entries).filter((e) => e.projectId === projectId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const ev = live(d.evidence);
  const evFor = (id) => ev.filter((x) => x.entryId === id);
  const lines = live(d.bomLines).filter((l) => l.projectId === projectId);
  const parts = new Map((d.parts || []).map((p) => [p.id, p]));
  const purchases = live(d.purchases).filter((p) => p.projectId === projectId);
  const costs = projectCosts(d, projectId, project);
  const levels = skillLevels(d);
  const skills = live(d.skills);
  const skillIds = new Set(entries.flatMap((e) => e.skillIds || []));
  const tasks = live(d.tasks).filter((t) => t.projectId === projectId);
  const resources = live(d.resources).filter((r) => r.projectId === projectId || entries.some((e) => (e.resourceIds || []).includes(r.id)));
  return { project, track, entries, evFor, lines, parts, purchases, costs, levels, skills, skillIds, tasks, resources };
}

const evLine = (x) =>
  x.kind === "measurement" ? `${x.caption ? x.caption + ": " : ""}${x.value} ${x.unit || ""}`.trim()
  : x.kind === "snippet" ? `snippet${x.caption ? " (" + x.caption + ")" : ""}`
  : x.kind === "photo" ? `photo${x.caption ? ": " + x.caption : ""}`
  : `link: ${x.text || x.value || ""}`;

export function briefMarkdown(d, projectId) {
  const g = gather(d, projectId);
  const p = g.project;
  if (!p) return "";
  const o = [];
  const hrs = g.entries.reduce((n, e) => n + (e.sessionSec || 0), 0) / 3600;
  o.push(`# ${p.name}`, "");
  o.push(`- Track: ${g.track?.name || "Robotics"}`, `- Stage: ${p.stage}${p.closedAt ? ` (closed ${day(p.closedAt)})` : ""}`, `- Logged time: ${hrs.toFixed(1)} h across ${g.entries.length} entries`);
  if (p.summary) o.push(`- Summary: ${one(p.summary)}`);
  o.push("", "## Aims", "");
  if ((p.aims || []).length) for (const a of p.aims) o.push(`- ${one(a.text)} — ${a.met === true ? "met" : a.met === false ? "not met" : "not assessed"}${a.reflection ? `. Reflection: ${one(a.reflection)}` : ""}`);
  else o.push("- No aims recorded.");

  o.push("", "## Timeline", "");
  for (const s of STAGES) if (p.stageDates?.[s]) o.push(`- ${p.stageDates[s]}: entered ${s}`);
  for (const e of g.entries) o.push(`- ${day(e.createdAt)} ${e.type}: ${one(e.title) || "(untitled)"}`);

  o.push("", "## Bill of materials", "", "| Part | Qty | Planned | Source |", "| --- | --- | --- | --- |");
  for (const l of g.lines) o.push(`| ${cell(g.parts.get(l.partId)?.name || l.name)} | ${l.qty} | ${l.fromInventory ? "Rp 0" : rp(l.plannedPriceIdr == null ? null : lineTotal(l))} | ${l.fromInventory ? "from inventory" : "to buy"} |`);
  o.push("", `Planned spend: ${rp(g.costs.planned)}. Actual spend: ${rp(g.costs.actual)}. Variance: ${rp(g.costs.variance)}.${g.costs.cap ? ` Budget cap: ${rp(g.costs.cap)}.` : ""}${g.costs.costPerSkill != null ? ` Cost per skill proven: ${rp(g.costs.costPerSkill)}.` : ""}`);
  if (g.purchases.length) {
    o.push("", "Purchases:");
    for (const x of g.purchases) o.push(`- ${x.date} ${cell(g.parts.get(x.partId)?.name || "part")} x${x.qty} at ${rp(x.priceIdr)} each from ${x.shop || "unknown shop"}`);
  }

  const section = (title, type, render) => {
    const list = g.entries.filter((e) => e.type === type);
    o.push("", `## ${title}`, "");
    if (!list.length) o.push("- None recorded.");
    for (const e of list) render(e);
  };
  section("Decisions", "decision", (e) => o.push(`- ${day(e.createdAt)} ${one(e.title)}. Question: ${one(e.fields?.question)}. Choice: ${one(e.fields?.choice)}. Why: ${one(e.fields?.why || e.bodyMd)}`));
  section("Failures and root causes", "fail", (e) => {
    const f = e.fields || {};
    o.push(`### ${day(e.createdAt)} ${one(e.title) || "Failure"}`, "", `- Symptom: ${one(f.symptom) || "—"}`, `- Hypothesis: ${one(f.hypothesis) || "—"}`, `- Fix: ${one(f.fix) || "—"}`, `- Root cause: ${one(f.rootCause) || "—"}`);
    const ev = g.evFor(e.id);
    if (ev.length) o.push(`- Evidence: ${ev.map(evLine).join("; ")}`);
    o.push("");
  });
  section("Experiments and measurements", "experiment", (e) => {
    const f = e.fields || {};
    o.push(`### ${day(e.createdAt)} ${one(e.title) || "Experiment"}`, "", `- Hypothesis: ${one(f.hypothesis) || "—"}`, `- Setup: ${one(f.setup) || "—"}`);
    const m = g.evFor(e.id).filter((x) => x.kind === "measurement");
    if (m.length) { o.push("", "| Measurement | Value | Unit |", "| --- | --- | --- |"); for (const x of m) o.push(`| ${cell(x.caption)} | ${cell(x.value)} | ${cell(x.unit)} |`); o.push(""); }
    o.push(`- Result: ${one(f.result) || "—"}`, "");
  });

  o.push("", "## Skills with evidence", "", "| Skill | Level | Proofs (all projects) |", "| --- | --- | --- |");
  const sk = g.skills.filter((s) => g.skillIds.has(s.id) || g.tasks.some((t) => (t.skillIds || []).includes(s.id)));
  for (const s of sk) { const l = g.levels.get(s.id); o.push(`| ${cell(s.name)} | ${l?.level || 0}/5 | ${l?.proofCount || 0} |`); }
  if (!sk.length) o.push("| None tagged | | |");

  o.push("", "## Resources", "");
  if (g.resources.length) for (const r of g.resources) o.push(`- ${one(r.title)} (${r.type})${r.note ? `: ${one(r.note)}` : ""}${r.url ? ` ${r.url}` : ""}`);
  else o.push("- None recorded.");

  o.push("", "## Reflections", "");
  const refl = g.entries.filter((e) => e.type === "reflect");
  for (const e of refl) o.push(`- ${day(e.createdAt)} ${one(e.title)}: ${one(e.bodyMd)}`);
  for (const a of p.aims || []) if (a.reflection) o.push(`- On "${one(a.text)}": ${one(a.reflection)}`);
  if (!refl.length && !(p.aims || []).some((a) => a.reflection)) o.push("- None recorded.");
  return o.join("\n");
}

export function reportBrief(d, projectId, style = "portfolio") {
  const s = STYLES[style] || STYLES.portfolio;
  return `${s.prompt} ${RULES}\n\n---\n\n${briefMarkdown(d, projectId)}\n`;
}

export function projectMarkdown(d, projectId) {
  const g = gather(d, projectId);
  if (!g.project) return "";
  const o = [briefMarkdown(d, projectId), "", "## Diary", ""];
  for (const e of g.entries) {
    o.push(`### ${day(e.createdAt)} ${e.createdAt.slice(11, 16)} · ${e.type} · ${one(e.title)}`, "");
    for (const [k, v] of Object.entries(e.fields || {})) if (v) o.push(`- ${k}: ${one(v)}`);
    if (e.bodyMd) o.push("", e.bodyMd);
    const ev = g.evFor(e.id);
    if (ev.length) o.push("", ...ev.map((x) => `- Evidence: ${evLine(x)}`));
    o.push("");
  }
  o.push("## Tasks", "");
  for (const s of STAGES) for (const t of g.tasks.filter((t) => t.stage === s).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) o.push(`- [${t.done ? "x" : " "}] ${s}: ${one(t.title)}`);
  return o.join("\n");
}

const csvCell = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function bomCsv(d, projectId) {
  const g = gather(d, projectId);
  const rows = [["part", "qty", "planned_unit_idr", "planned_total_idr", "from_inventory", "status", "links"]];
  for (const l of g.lines) {
    const part = g.parts.get(l.partId);
    rows.push([part?.name || l.name, l.qty, l.fromInventory ? 0 : l.plannedPriceIdr ?? "", l.plannedPriceIdr == null && !l.fromInventory ? "" : lineTotal(l),
      l.fromInventory ? "yes" : "no", part?.status || "", [...(part?.links || []), ...(l.links || [])].map((x) => x.url).join(" ")]);
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
