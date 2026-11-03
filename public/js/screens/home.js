// Home: one main thing. The next smallest action leads; the proof gap, skills line and a compact heat strip follow.
import * as store from "../store.js";
import * as A from "../actions.js";
import * as db from "../db.js";
import { html } from "../util.js";
import { icon, toast } from "../ui.js";
import { nextAction, proofsByDay, heatIndex, proofGap } from "../derive.js";
import { loadSample } from "../sample.js";
import { fuse } from "./project.js";

const GiB = 1024 ** 3;

// Problems only: failing writes and quota. The backup reminder lives in the header chip, nowhere else.
export function banners() {
  const out = [];
  if (store.status.state === "error") out.push(html`<div class="banner bad"><span class="st bad">Writes are failing: ${store.status.error || "unknown error"}. Your changes are on this device. Export a backup now.</span><button class="btn s" data-act="export-backup">Export backup</button></div>`);
  const used = A.storageEstimate();
  if (used > 0.7 * GiB) out.push(html`<div class="banner warn"><span class="st warn">Stored data is ${(used / GiB * 100).toFixed(0)} percent of the 1 GiB free limit. Export a backup and archive old photos.</span></div>`);
  const reads = db.readsToday();
  if (reads > 35000) out.push(html`<div class="banner warn"><span class="st warn">${reads} reads today on this device, over 70 percent of the 50 000 daily free reads. Export a backup to be safe.</span></div>`);
  return out;
}

export function heatStrip(d, weeks = 16) {
  const byDay = proofsByDay(d);
  const end = new Date(); end.setHours(0, 0, 0, 0);
  const start = new Date(end); start.setDate(start.getDate() - (7 * (weeks - 1) + ((end.getDay() + 6) % 7)));
  const cells = [];
  let total = 0;
  for (let i = 0; i < weeks * 7; i++) {
    const x = new Date(start); x.setDate(start.getDate() + i);
    const n = byDay.get(k0(x)) || 0;
    if (x <= end) total += n;
    cells.push(x > end ? html`<i data-future></i>` : html`<i data-h="${heatIndex(n)}" title="${k0(x)}: ${n} proof${n === 1 ? "" : "s"}"></i>`);
  }
  return html`<div class="heat-strip">
    <div class="spread"><p class="label">Proof, last ${weeks} weeks · ${total}</p>${legend()}</div>
    <div class="cal" role="img" aria-label="${total} proofs over the last ${weeks} weeks">${cells}</div></div>`;
}
export const legend = () => html`<span class="legend" aria-hidden="true">0<i data-h="0"></i>1<i data-h="1"></i>2<i data-h="2"></i>3<i data-h="3"></i>4<i data-h="4"></i>5+<i data-h="5"></i></span>`;

export default {
  title: "Home",
  dark: true,
  render() {
    const d = A.data();
    const projects = store.all("projects");
    if (!projects.length && !store.all("entries").length && !store.all("parts").length) {
      return html`<section class="home-empty stack l">
        <h1>Start a project, and Fuse walks you from the problem to the write-up.</h1>
        <div class="row">
          <button class="btn primary" data-act="new-project">Start Flowstate</button>
          <a class="btn" href="#/import">Import a plan</a>
          <button class="btn" data-act="sample">Load sample data</button>
        </div></section>`;
    }
    const proj = A.activeProject();
    const lv = A.levels();
    const skills = store.all("skills");
    const proven = skills.filter((s) => (lv.get(s.id)?.level || 0) >= 2).length;
    const na = proj ? nextAction(d, proj) : null;
    const gap = proofGap(proj, d.tasks, d.entries, d.evidence);

    return html`<div class="home">
    ${banners()}
    ${proj ? html`<section class="next-card" aria-labelledby="na-t">
      <div class="spread"><a class="label" href="#/p/${proj.id}">${proj.name} · ${proj.stage}</a>${proj.mode === "flow" ? html`<a class="btn s text" href="#/flow/${proj.id}">Continue Flowstate</a>` : ""}</div>
      ${fuse(proj, { mini: true })}
      <p class="label" style="margin-top:16px">Next smallest action</p>
      <p class="t" id="na-t">${na?.text || "Add the next task for this project."}</p>
      <div class="row">
        ${na?.taskId ? html`<button class="btn primary" data-act="done-next" data-id="${na.taskId}">${icon("check")}Mark done</button>` : ""}
        <a class="btn outline" href="#/entry/new?project=${proj.id}${na?.taskId ? `&task=${na.taskId}` : ""}">${icon("camera")}Log proof</a>
        <button class="btn text" data-act="edit-next" data-id="${proj.id}">Write my own</button>
        ${na?.source === "override" ? html`<button class="btn text" data-act="clear-next" data-id="${proj.id}">Use the task list</button>` : ""}
      </div>
    </section>` : html`<section class="next-card"><p class="t">No open project.</p><div class="row"><button class="btn primary" data-act="new-project">Start Flowstate</button><a class="btn" href="#/projects">Open projects</a></div></section>`}

    ${gap ? html`<section class="proof-gap" aria-label="Missing proof">
      <span class="st warn">Missing proof</span><span class="grow"><b>${gap.title}</b> is done but has no ${gap.needs.join(" or ")} yet.</span>
      <a class="btn s" href="#/entry/new?project=${proj.id}&task=${gap.taskId}">Add proof</a></section>` : ""}

    <a class="skills-line" href="#/skills"><b>${proven} of ${skills.length}</b> skills proven<span class="muted">Open skills</span></a>
    ${heatStrip(d)}
    </div>`;
  },
  acts: {
    sample: () => { loadSample(); toast("Sample data loaded. Remove it from Settings when you are ready."); },
    "new-project": newProject,
    "done-next": (el) => { const r = A.toggleTask(el.dataset.id); offerProof(el.dataset.id, r); },
    "edit-next": async (el) => {
      const { ask } = await import("../ui.js");
      const p = store.get("projects", el.dataset.id);
      const v = await ask("Next smallest action", [{ name: "t", label: "One small step you can do next", value: p.nextAction || "" }]);
      if (v) store.update("projects", p.id, { nextAction: v.t.trim() });
    },
    "clear-next": (el) => store.update("projects", el.dataset.id, { nextAction: "" }),
  },
};

const k0 = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;

// New projects start in Flowstate (decision H2); "Plain project" keeps the old free mode.
export async function newProject() {
  const { ask } = await import("../ui.js");
  const v = await ask("New project", [
    { name: "name", label: "Name", placeholder: "Line-follower v2" },
    { name: "mode", label: "How to start", type: "select", value: "flow", options: [{ value: "flow", label: "Flowstate: one question at a time" }, { value: "free", label: "Plain project page" }] },
  ], { submit: "Create project" });
  if (!v?.name?.trim()) return;
  const p = A.createProject(v.name.trim(), { mode: v.mode === "free" ? "free" : "flow" });
  location.hash = v.mode === "free" ? `#/p/${p.id}` : `#/flow/${p.id}`;
}

export function offerProof(taskId, r) {
  const t = store.get("tasks", taskId);
  if (!t) return;
  if (r?.result) toast(`Done: ${t.title}.`, { undo: r.undo, action: () => { location.hash = `#/entry/new?task=${t.id}&project=${t.projectId}`; }, actionLabel: "Log proof" });
  else if (r) toast("Marked not done.", { undo: r.undo, ms: 4000 });
}
