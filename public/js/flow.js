// Flowstate: pure rules for the seven stations. No DOM, no storage; unit-tested.
import { projectTasks, nextAction, judge, PROOF_KINDS } from "./derive.js";

export const STATIONS = [
  { n: 1, id: "problem", title: "Problem", q: "What problem are you solving, for whom, and how will you know it worked?" },
  { n: 2, id: "study", title: "Study", q: "Which physics or mechanics must you understand before you build?" },
  { n: 3, id: "design", title: "Design", q: "What did you consider, and why this option?" },
  { n: 4, id: "plan", title: "Plan and order", q: "What does it cost and what do you need to buy?" },
  { n: 5, id: "build", title: "Build", q: "What did you make or break today?" },
  { n: 6, id: "test", title: "Test", q: "Did it meet the success measure from station 1?" },
  { n: 7, id: "writeup", title: "Write-up", q: "What would you tell someone who has never seen this?" },
];
const live = (a) => (a || []).filter((x) => !x.archived);
const clampStation = (n) => Math.min(7, Math.max(1, Math.round(+n) || 1));

export const nextStation = (n) => clampStation(n + 1);
export const prevStation = (n) => clampStation(n - 1);
export const canSkip = () => true; // Next never blocks; a skipped station is marked "later"

// Has the station produced its one required output?
export function stationOutputPresent(n, project, d = {}) {
  if (!project) return false;
  const has = (types) => live(d.entries).some((e) => e.projectId === project.id && !e.parked && types.includes(e.type) && String(e.title || "").trim());
  switch (clampStation(n)) {
    case 1: return !!(String(project.problem?.statement || "").trim() && String(project.problem?.successMeasure?.text || "").trim());
    case 2: return has(["study"]);
    case 3: return has(["design", "decision"]);
    case 4: return projectTasks(d, project.id).length > 0 || live(d.bomLines).some((l) => l.projectId === project.id);
    case 5: return has(["build", "fail"]);
    case 6: return project.testResult?.value != null && project.testResult.value !== "";
    case 7: return !!String(project.writeup || "").trim();
  }
  return false;
}

// Per-station status for the progress row: "done" (dot), "later" (ring), "todo".
export function stationStates(project, d) {
  return STATIONS.map((s) => (stationOutputPresent(s.n, project, d) ? "done" : project?.stationState?.[s.n] === "later" ? "later" : "todo"));
}

// Leaving a station without its output marks it "later"; producing it clears the mark.
export function leaveStation(project, n, d) {
  const st = { ...(project.stationState || {}) };
  if (stationOutputPresent(n, project, d)) delete st[n];
  else if (canSkip(n)) st[n] = "later";
  return st;
}

const day = (iso) => (iso ? String(iso).slice(0, 10) : "");

// "Last time: <title> on <date>. Next: <next smallest action>."
export function resumeLine(project, entries, tasks) {
  if (!project) return "";
  const last = live(entries).filter((e) => e.projectId === project.id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  const na = nextAction({ tasks }, project).text;
  const parts = [];
  if (last) parts.push(`Last time: ${last.title || "(untitled)"} on ${day(last.createdAt)}.`);
  parts.push(`Next: ${na || "pick up at station " + clampStation(project.station) + "."}`.replace(/\.\.$/, "."));
  return parts.join(" ");
}
export const showResume = (project, now = Date.now()) => !!project?.flowSeenAt && now - new Date(project.flowSeenAt) > 12 * 3600e3;

// Station 6: compare the result with the success measure. Returns { met: true|false|null, text }.
export function verdict(project) {
  const m = project?.problem?.successMeasure || {};
  const r = project?.testResult || {};
  const met = judge(m, r.value);
  return { met, text: met == null ? "Not judged yet" : met ? "Met" : "Not met" };
}

// Station 7: assemble the user's own words under headings. Nothing is rewritten or summarised.
export function assembleWriteup(project, entries, evidence = []) {
  if (!project) return "";
  const es = live(entries).filter((e) => e.projectId === project.id && !e.parked).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const pr = project.problem || {};
  const m = pr.successMeasure || {};
  const o = [];
  const add = (h, lines) => { const l = lines.filter((x) => String(x || "").trim()); if (l.length) o.push(`## ${h}`, "", ...l, ""); };
  add("Problem", [pr.statement, pr.forWhom && `For: ${pr.forWhom}`, m.text && `Success measure: ${m.text}${m.value != null && m.value !== "" ? ` (${m.op || ">="} ${m.value} ${m.unit || ""})`.replace(/ \)$/, ")") : ""}`]);
  add("What I studied", es.filter((e) => e.type === "study").map((e) => `- ${e.title}${e.fields?.concept ? `: ${e.fields.concept}` : ""}${e.fields?.whyItMatters ? `. ${e.fields.whyItMatters}` : ""}`));
  add("Decisions", es.filter((e) => e.type === "decision" || e.type === "design").map((e) => `- ${e.title}${e.fields?.why ? `. ${e.fields.why}` : ""}`));
  add("What broke", es.filter((e) => e.type === "fail").map((e) => `- ${e.title}${e.fields?.fix ? `. Fix: ${e.fields.fix}` : ""}`));
  const v = verdict(project);
  const r = project.testResult || {};
  add("Result", [r.value != null && r.value !== "" ? `${r.value} ${m.unit || ""}`.trim() + ` against the measure: ${v.text}.` : "", r.note]);
  add("Reflections", es.filter((e) => e.type === "reflect").map((e) => `- ${e.title}${e.bodyMd ? `: ${e.bodyMd}` : ""}`));
  void evidence; void PROOF_KINDS;
  return o.join("\n").trim() + "\n";
}

// "Stuck?" prompt: the project so far, for pasting into any AI. Fuse calls no AI itself.
export function stuckPrompt(project, d, station) {
  const s = STATIONS[clampStation(station) - 1];
  const pr = project.problem || {};
  const m = pr.successMeasure || {};
  const last3 = live(d.entries).filter((e) => e.projectId === project.id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 3);
  const parts = live(d.bomLines).filter((l) => l.projectId === project.id);
  return [
    "I am a student building a hardware project and I am stuck. Ask me questions and suggest the next small step. Do not write my notes for me.",
    "", `Project: ${project.name}`, `Problem: ${pr.statement || "not written yet"}`, `For whom: ${pr.forWhom || "not written yet"}`,
    `Success measure: ${m.text || "not set"}${m.value != null && m.value !== "" ? ` (${m.op} ${m.value} ${m.unit || ""})` : ""}`,
    `Current station: ${s.n}. ${s.title}: ${s.q}`, "", "Last three entries:",
    ...(last3.length ? last3.map((e) => `- ${day(e.createdAt)} ${e.type}: ${e.title || "(untitled)"}`) : ["- none"]),
    "", "Parts list:", ...(parts.length ? parts.map((l) => `- ${l.name} x${l.qty}`) : ["- none yet"]),
  ].join("\n");
}
