// Home: always dark. Headline, evidence gauge, the fuse, stats, next smallest action, heat calendar, recent log.
import * as store from "../store.js";
import * as A from "../actions.js";
import * as db from "../db.js";
import { html, rp, hours, stamp, today, dateOf } from "../util.js";
import { icon, toast } from "../ui.js";
import { nextAction, overallCostPerSkill, proofsByDay, heatIndex, PROOF_KINDS } from "../derive.js";
import { loadSample } from "../sample.js";
import { fuse } from "./project.js";

const TYPES = [["build", "Build"], ["fail", "Fail"], ["decision", "Decision"], ["experiment", "Experiment"], ["purchase", "Purchase"], ["reflect", "Reflect"]];
const GiB = 1024 ** 3;

export function banners() {
  const s = store.settings();
  const out = [];
  const hasData = store.all("entries").length + store.all("parts").length > 0;
  if (store.status.state === "error") out.push(html`<div class="banner bad"><span class="st bad">Writes are failing: ${store.status.error || "unknown error"}. Your changes are on this device. Export a backup now.</span><button class="btn s" data-act="export-backup">Export backup</button></div>`);
  const age = s.lastBackupAt ? (Date.now() - new Date(s.lastBackupAt)) / 864e5 : Infinity;
  if (hasData && age > 7) out.push(html`<div class="banner warn"><span class="st warn">${s.lastBackupAt ? `Last backup was ${Math.floor(age)} days ago.` : "No backup yet."} Export one so the diary has three copies.</span><button class="btn s" data-act="export-backup">${icon("download")}Export backup</button></div>`);
  const used = A.storageEstimate();
  if (used > 0.7 * GiB) out.push(html`<div class="banner warn"><span class="st warn">Stored data is ${(used / GiB * 100).toFixed(0)} percent of the 1 GiB free limit. Export a backup and archive old photos.</span></div>`);
  const reads = db.readsToday();
  if (reads > 35000) out.push(html`<div class="banner warn"><span class="st warn">${reads} reads today on this device, over 70 percent of the 50 000 daily free reads. Export a backup to be safe.</span></div>`);
  return out;
}

export default {
  title: "Home",
  dark: true,
  render() {
    const d = A.data();
    const projects = store.all("projects");
    const entries = store.all("entries").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (!projects.length && !entries.length && !store.all("parts").length) {
      return html`<section class="hero"><p class="label" data-rise>Fuse · hardware log</p>
        <h1 class="pair">Build small. <b class="grad-text">Prove everything.</b></h1>
        <p class="sub">Plan builds with real prices, track every part, and let proof heat up your skills.</p></section>
        <div class="grid3">
          <div class="panel stack"><h3>Start from a plan</h3><p class="muted">Ask any AI for a plan with the Fuse prompt and import it in one pass.</p><a class="btn hot" href="#/import">Import a plan</a></div>
          <div class="panel stack"><h3>Start empty</h3><p class="muted">Name a project. Add tasks and parts as you go.</p><button class="btn primary" data-act="new-project">New project</button></div>
          <div class="panel stack"><h3>Look around first</h3><p class="muted">Load the Line-follower v1 sample. Remove it later in one tap from Settings.</p><button class="btn" data-act="sample">Load sample data</button></div>
        </div>`;
    }
    const proj = A.activeProject();
    const lv = A.levels();
    const skills = store.all("skills");
    const proven = skills.filter((s) => (lv.get(s.id)?.level || 0) >= 2).length;
    const proofs = store.all("evidence").filter((e) => PROOF_KINDS.has(e.kind)).length;
    const ratio = skills.length ? proven / skills.length : 0;
    const secs = entries.reduce((n, e) => n + (e.sessionSec || 0), 0);
    const cps = overallCostPerSkill(d);
    const na = proj ? nextAction(d, proj) : null;
    const s = store.settings();

    // 16-week calendar, Monday-first columns
    const byDay = proofsByDay(d);
    const end = new Date(); end.setHours(0, 0, 0, 0);
    const start = new Date(end); start.setDate(start.getDate() - (7 * 15 + ((end.getDay() + 6) % 7)));
    const cells = [];
    for (let i = 0; i < 16 * 7; i++) {
      const x = new Date(start); x.setDate(start.getDate() + i);
      const n = byDay.get(k0(x)) || 0;
      cells.push(x > end ? html`<i data-future></i>` : html`<i data-h="${heatIndex(n)}" title="${k0(x)}: ${n} proof${n === 1 ? "" : "s"}"></i>`);
    }
    const R = 70, C = 2 * Math.PI * R;
    const last = entries[0];

    return html`<div class="home-flow">
    ${banners()}
    <section class="hero">
      <p class="label" data-rise>${today()} · ${proj ? `${proj.name}` : "No open project"}</p>
      <h1 class="pair">${proofs} proofs logged. <b class="grad-text">${proven ? `${proven} skill${proven === 1 ? "" : "s"} burning.` : "Light the first one."}</b></h1>
      <p class="sub">Last backup: <span class="mono">${s.lastBackupAt ? dateOf(s.lastBackupAt) : "never"}</span> · <button class="btn s ghost" data-act="export-backup">${icon("download")}Export now</button></p>
    </section>

    <div class="home-grid" data-o="4">
      <div class="panel gauge-wrap" data-rise style="--i:1">
        <div class="gauge" role="img" aria-label="${proven} of ${skills.length} skills have proof">
          <svg viewBox="0 0 160 160"><defs><linearGradient id="hg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF3D81"/><stop offset=".55" stop-color="#FF6A1A"/><stop offset="1" stop-color="#FFC629"/></linearGradient></defs>
            <circle cx="80" cy="80" r="${R}" fill="none" stroke="var(--line)" stroke-width="12" stroke-dasharray="3 5"/>
            <circle cx="80" cy="80" r="${R}" fill="none" stroke="url(#hg)" stroke-width="12" stroke-linecap="round" stroke-dasharray="${C * ratio} ${C}" style="filter:drop-shadow(0 0 6px rgba(255,106,26,.6))"/></svg>
          <div class="c"><b data-count="${proven}">${proven}</b><span>of ${skills.length} proven</span></div>
        </div>
        <div class="stack s"><p class="label">Evidence</p><p>Skills level up only from proof: a photo, a measurement with a unit, or a snippet.</p><a class="btn s" href="#/skills">Open the heat grid</a></div>
      </div>
      <div class="panel stack" data-rise style="--i:2">
        ${proj ? html`<div class="spread"><a href="#/p/${proj.id}"><h3>${proj.name}</h3></a><span class="label">${proj.stage}</span></div>${fuse(proj, { mini: false, readonly: true })}` : html`<p class="muted">No open project.</p><button class="btn primary" data-act="new-project">New project</button>`}
        <div class="stats">
          <div class="stat"><p class="label">Logged</p><p class="v"><span data-count="${hours(secs)}" data-dec="${secs / 3600 >= 10 ? 0 : 1}">${hours(secs)}</span><small>h</small></p></div>
          <div class="stat"><p class="label">Spent</p><p class="v money-v">${rp(cps.actual)}</p></div>
          <div class="stat"><p class="label">Skills proven</p><p class="v"><span data-count="${proven}">${proven}</span></p></div>
          <div class="stat"><p class="label">Cost per skill</p><p class="v money-v">${cps.costPerSkill == null ? "—" : rp(cps.costPerSkill)}</p></div>
        </div>
      </div>
    </div>

    ${proj ? html`<section class="next-card" style="margin-top:20px" data-rise data-o="1">
      <p class="label">Next smallest action · ${proj.name}</p>
      <p class="t">${na?.text || "Add the next task for this project."}</p>
      <div class="row">
        ${na?.taskId ? html`<button class="btn primary" data-act="done-next" data-id="${na.taskId}">${icon("check")}Mark done</button>` : ""}
        <a class="btn" href="#/entry/new?project=${proj.id}${na?.taskId ? `&task=${na.taskId}` : ""}">${icon("camera")}Log proof</a>
        <button class="btn" data-act="edit-next" data-id="${proj.id}">Write my own</button>
        ${na?.source === "override" ? html`<button class="btn ghost" data-act="clear-next" data-id="${proj.id}" style="color:#0D0E10">Use the task list</button>` : ""}
      </div>
    </section>` : ""}

    <section style="margin-top:20px" class="stack" data-o="2">
      <p class="label">Quick log</p>
      <div class="quick">${TYPES.map(([t, l]) => html`<a href="#/entry/new?type=${t}${proj ? `&project=${proj.id}` : ""}" class="ty-${t}">${icon(t)}${l}</a>`)}</div>
    </section>

    <div class="grid2" style="margin-top:20px" data-o="5">
      <section class="panel stack">
        <div class="spread"><h3>Evidence heat, 16 weeks</h3>
          <span class="legend">less <i style="border:1px dashed var(--line-strong)"></i><i style="background:var(--heat-1)"></i><i style="background:var(--heat-2)"></i><i style="background:var(--heat-3)"></i><i style="background:var(--heat-4)"></i><i style="background:var(--heat-5)"></i> more</span></div>
        <div class="cal" role="img" aria-label="Proof per day over 16 weeks">${cells}</div>
      </section>
      <section class="console" aria-label="Recent log">
        <div class="bar"><span class="dots"><i></i><i></i><i></i></span><span>fuse.log · recent</span><a href="#/log" style="margin-left:auto;color:inherit">Open log</a></div>
        <div class="lines">${entries.slice(0, 8).map((e) => html`<a class="ln" href="#/entry/${e.id}"><span class="ts">${stamp(e.createdAt)}</span><span class="ty ty-${e.type}">${e.type}</span><span class="tx">${e.title || "(untitled)"}</span></a>`)}
          ${entries.length ? "" : html`<span class="ts">no entries yet. Tap + to log one.</span>`}</div>
      </section>
    </div>

    ${last ? html`<section class="only-s" style="margin-top:20px" data-o="3"><p class="label">Last entry</p><a class="panel last-entry" href="#/entry/${last.id}" style="display:block;margin-top:8px"><span class="mono subtle">${stamp(last.createdAt)} · <span class="ty-${last.type}">${last.type}</span></span><p style="font-weight:700">${last.title || "(untitled)"}</p></a></section>` : ""}
    </div>`;
  },
  mount(root) {
    if (!root.classList.contains("ignite") || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    root.querySelectorAll("[data-count]").forEach((el) => {
      const end = parseFloat(el.dataset.count), dec = +(el.dataset.dec || 0), t0 = performance.now();
      if (!Number.isFinite(end)) return;
      const tick = (now) => { const t = Math.min((now - t0) / 640, 1); el.textContent = (t === 1 ? end : end * (1 - Math.pow(2, -10 * t))).toFixed(dec); if (t < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
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

export async function newProject() {
  const { ask } = await import("../ui.js");
  const v = await ask("New project", [{ name: "name", label: "Name", placeholder: "Line-follower v2" }], { submit: "Create project" });
  if (v?.name?.trim()) { const p = A.createProject(v.name.trim()); location.hash = `#/p/${p.id}`; }
}

export function offerProof(taskId, r) {
  const t = store.get("tasks", taskId);
  if (!t) return;
  if (r?.result) toast(`Done: ${t.title}.`, { undo: r.undo, action: () => { location.hash = `#/entry/new?task=${t.id}&project=${t.projectId}`; }, actionLabel: "Log proof" });
  else if (r) toast("Marked not done.", { undo: r.undo, ms: 4000 });
}
