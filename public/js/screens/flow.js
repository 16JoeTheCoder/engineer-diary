// Flowstate: one project, one station, one question. Autosaves while typing; Next never blocks.
import * as store from "../store.js";
import * as A from "../actions.js";
import { html, raw, copyText, moneyHtml, dateOf, nowIso } from "../util.js";
import { icon, toast } from "../ui.js";
import { STATIONS, nextStation, prevStation, stationStates, leaveStation, resumeLine, showResume, verdict, assembleWriteup, stuckPrompt } from "../flow.js";
import { projectTasks, projectCosts } from "../derive.js";
import { uploadFile, ACCEPT } from "../files.js";
import { projectDefaults } from "../backup.js";

const drafts = new Map(); // `${pid}:${station}` -> entry id written this session
let parking = false, resumeShownFor = null, saveTimer = null, resumeCache = { pid: null, text: "" };

const station = (ctx, p) => Math.min(7, Math.max(1, +(ctx.query.s || p.station || 1)));
const ent = (pid, n) => store.get("entries", drafts.get(`${pid}:${n}`));

function field(key, label, value, { rows = 0, ph = "", type = "text", inputmode = "" } = {}) {
  const id = `fl-${key.replace(/\W/g, "-")}`;
  return html`<label class="f"><span>${label}</span>${rows
    ? html`<textarea class="in" id="${id}" data-k="${id}" data-fl="${key}" rows="${rows}" placeholder="${ph}">${value ?? ""}</textarea>`
    : html`<input class="in" id="${id}" data-k="${id}" data-fl="${key}" type="${type}" ${inputmode ? raw(`inputmode="${inputmode}"`) : ""} value="${value ?? ""}" placeholder="${ph}">`}</label>`;
}

function body(n, p, d) {
  const pr = p.problem;
  const m = pr.successMeasure;
  const listOf = (types) => d.entries.filter((e) => e.projectId === p.id && !e.archived && !e.parked && types.includes(e.type)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const done = (types) => { const l = listOf(types); return l.length ? html`<ul class="stack s" style="padding-left:20px;margin:0">${l.map((e) => html`<li><a href="#/entry/${e.id}">${e.title || "(untitled)"}</a> <span class="mono subtle">${dateOf(e.createdAt)}</span></li>`)}</ul>` : ""; };
  const cur = (type) => ent(p.id, n) || { title: "", fields: {}, bodyMd: "", type };
  const another = html`<button class="btn s text" data-act="fl-new">Start another</button>`;
  switch (n) {
    case 1: return html`<div class="stack">
      ${field("pr.statement", "The problem", pr.statement, { rows: 4, ph: "My robot cannot follow a line around a bend without leaving it." })}
      ${field("pr.forWhom", "For whom", pr.forWhom, { ph: "Me, for the school robotics fair" })}
      ${field("m.text", "How you will know it worked", m.text, { ph: "Three full laps of the A3 oval without leaving the line" })}
      <div class="row" style="align-items:end">
        <label class="f" style="width:7em"><span>Test</span><select class="in" data-fl="m.op" data-k="fl-op">${[">=", "<=", "="].map((o) => html`<option ${o === m.op ? raw("selected") : ""}>${o}</option>`)}</select></label>
        <div style="flex:1">${field("m.value", "Target number", m.value, { inputmode: "decimal", ph: "3" })}</div>
        <div style="flex:1">${field("m.unit", "Unit", m.unit, { ph: "laps" })}</div>
      </div></div>`;
    case 2: { const e = cur("study"); return html`<div class="stack">${done(["study"])}
      ${field("e.title", "Concept", e.title, { ph: "PID control" })}
      ${field("e.fields.whyItMatters", "Why it matters for this build", e.fields.whyItMatters, { rows: 3 })}
      ${field("e.fields.equations", "Equations, with units", e.fields.equations, { rows: 2, ph: "u = Kp e + Ki ∫e dt + Kd de/dt" })}
      ${field("e.fields.workedExample", "Worked example", e.fields.workedExample, { rows: 2 })}
      <div class="row">${another}<a class="btn s text" href="#/entry/new?type=study&project=${p.id}">Open the full study form</a></div></div>`; }
    case 3: { const e = cur("decision"); return html`<div class="stack">${done(["design", "decision"])}
      ${field("e.fields.options", "Options you considered, one per line", e.fields.options, { rows: 3, ph: "Arduino Nano\nESP32" })}
      ${field("e.title", "Your choice", e.title, { ph: "ESP32" })}
      ${field("e.fields.why", "Why this option", e.fields.why, { rows: 3 })}
      ${field("e.fields.changeMyMind", "What would change my mind", e.fields.changeMyMind, { rows: 2 })}
      <label class="f"><span>Add a model or sketch (optional)</span><input type="file" accept="${ACCEPT}" data-fl-file></label>
      <div class="row">${another}</div></div>`; }
    case 4: { const tasks = projectTasks(d, p.id); const lines = d.bomLines.filter((l) => l.projectId === p.id && !l.archived); const c = projectCosts(d, p.id, p);
      return html`<div class="stack">
      <p>Planned <b class="mono">${moneyHtml(c.planned)}</b> · Spent <b class="mono">${moneyHtml(c.actual)}</b>${c.cap ? html` · Cap <b class="mono">${moneyHtml(c.cap)}</b>` : ""}</p>
      ${field("p.budgetCapIdr", "Budget cap, Rp", p.budgetCapIdr ? new Intl.NumberFormat("id-ID").format(p.budgetCapIdr) : "", { inputmode: "numeric", ph: "350.000" })}
      <form class="row" data-fl-add="task"><input class="in" name="v" placeholder="Add a task, then press Enter" aria-label="Add a task" style="flex:1"><button class="btn s">Add task</button></form>
      ${tasks.length ? html`<ul class="stack s" style="padding-left:20px;margin:0">${tasks.map((t) => html`<li>${t.stage}: ${t.title}</li>`)}</ul>` : ""}
      <form class="row" data-fl-add="part"><input class="in" name="v" placeholder="Add a part to buy. Owned parts cost Rp 0" aria-label="Add a part" style="flex:1"><button class="btn s">Add part</button></form>
      ${lines.length ? html`<ul class="stack s" style="padding-left:20px;margin:0">${lines.map((l) => html`<li>${l.name} x${l.qty}${l.fromInventory ? " · from inventory" : ""}</li>`)}</ul>` : ""}</div>`; }
    case 5: { const e = cur("build"); const t = e.type || "build"; return html`<div class="stack">
      <div class="seg" role="group" aria-label="Kind of entry"><button data-act="fl-kind" data-t="build" aria-pressed="${t === "build"}">I made something</button><button data-act="fl-kind" data-t="fail" aria-pressed="${t === "fail"}">Something broke</button></div>
      ${field("e.title", t === "fail" ? "What broke" : "What you made", e.title, { ph: t === "fail" ? "Motor A does not spin" : "Soldered the driver headers" })}
      ${t === "fail" ? html`${field("e.fields.symptom", "Symptom", e.fields.symptom, { rows: 2 })}${field("e.fields.fix", "Fix", e.fields.fix, { rows: 2 })}` : field("e.bodyMd", "Notes", e.bodyMd, { rows: 3 })}
      <p class="muted">Add a photo or measurement as proof from the full entry form.</p>
      <div class="row">${another}${e.id ? html`<a class="btn s text" href="#/entry/${e.id}">Add proof to this entry</a>` : ""}</div>
      ${done(["build", "fail"])}</div>`; }
    case 6: { const v = verdict(p); const r = p.testResult || {}; return html`<div class="stack">
      <div class="panel stack s"><p class="label">Success measure</p><p>${m.text || "Not set. Go back to station 1."}${m.value != null && m.value !== "" ? html` <span class="mono">(${m.op} ${m.value} ${m.unit})</span>` : ""}</p></div>
      ${field("r.value", `Your result${m.unit ? `, in ${m.unit}` : ""}`, r.value, { inputmode: "decimal", ph: "3" })}
      ${field("r.note", "How you tested it", r.note, { rows: 3 })}
      <p class="verdict" role="status">${v.met === true ? html`${icon("check")}Met` : v.met === false ? html`${icon("x")}Not met` : html`${icon("alert")}Not judged yet: add a number on both sides`}</p></div>`; }
    case 7: { const parked = d.entries.filter((e) => e.projectId === p.id && e.parked && !e.archived); return html`<div class="stack">
      ${field("p.writeup", "Write-up (your words, assembled from stations 1 to 6)", p.writeup || assembleWriteup(p, d.entries), { rows: 18 })}
      <div class="row"><button class="btn s text" data-act="fl-reassemble">Assemble again from my notes</button><a class="btn" href="#/export/${p.id}">${icon("file")}Export the project</a></div>
      ${parked.length ? html`<section class="stack s"><p class="label">Parked thoughts</p><ul class="stack s" style="padding-left:20px;margin:0">${parked.map((e) => html`<li>${e.title} <span class="mono subtle">${dateOf(e.createdAt)}</span></li>`)}</ul></section>` : ""}</div>`; }
  }
  return "";
}

export default {
  title: (ctx) => `Flowstate · ${store.get("projects", ctx.id)?.name || ""}`,
  render(ctx) {
    const raw0 = store.get("projects", ctx.id);
    if (!raw0) return html`<div class="empty">This project is not here.<a class="btn" href="#/projects">Open projects</a></div>`;
    const p = projectDefaults(raw0);
    const d = A.data();
    const n = station(ctx, p);
    const s = STATIONS[n - 1];
    const states = stationStates(p, d);
    if (resumeCache.pid !== p.id) resumeCache = { pid: p.id, text: showResume(p) ? resumeLine(p, d.entries, d.tasks) : "" };
    const resume = resumeShownFor !== p.id ? resumeCache.text : "";
    return html`<div class="flow">
      <div class="flow-top">
        <a class="btn s text" href="#/p/${p.id}">${icon("x")}Leave Flowstate</a>
        <nav class="dots" aria-label="Stations">${STATIONS.map((x, i) => html`<a href="#/flow/${p.id}?s=${x.n}" data-s="${states[i]}" ${x.n === n ? raw('aria-current="step"') : ""} aria-label="${x.n}. ${x.title}: ${states[i] === "done" ? "done" : states[i] === "later" ? "skipped, later" : "to do"}"><i></i></a>`)}</nav>
        <span class="saved-note" id="fl-saved" aria-live="polite"></span>
      </div>
      <main class="stack l" aria-labelledby="fl-h">
        ${resume ? html`<p class="resume">${resume} <button class="btn s text" data-act="fl-resume-ok">Got it</button></p>` : ""}
        <div><p class="label">Station ${n} of 7</p><h1 id="fl-h">${s.title}</h1><p class="q">${s.q}</p></div>
        ${body(n, p, d)}
        <div class="row">
          ${parking ? html`<form class="row" data-park style="flex:1"><input class="in" name="t" placeholder="A stray thought, parked for later" aria-label="Park a thought" style="flex:1" autofocus><button class="btn s">Park it</button></form>`
            : html`<button class="btn s text" data-act="fl-park">Park it</button>`}
          <button class="btn s text" data-act="fl-stuck">Stuck?</button>
        </div>
      </main>
      <nav class="flow-nav" aria-label="Station navigation">
        <button class="btn" data-act="fl-go" data-to="${prevStation(n)}" ${n === 1 ? raw("disabled") : ""}>Back</button>
        ${n < 7 ? html`<button class="btn primary" data-act="fl-go" data-to="${nextStation(n)}">Next</button>` : html`<a class="btn primary" href="#/p/${p.id}">Finish</a>`}
      </nav>
    </div>`;
  },
  mount(root, ctx) {
    const p0 = store.get("projects", ctx.id);
    if (!p0) return;
    const n = station(ctx, projectDefaults(p0));
    if (p0.station !== n || p0.mode !== "flow" || !p0.flowSeenAt || Date.now() - new Date(p0.flowSeenAt) > 6e4) {
      store.update("projects", p0.id, { ...projectDefaults(p0), station: n, mode: "flow", flowSeenAt: nowIso() });
    }
    root.addEventListener("input", (e) => {
      const el = e.target.closest("[data-fl]");
      if (!el) return;
      clearTimeout(saveTimer);
      const note = root.querySelector("#fl-saved");
      if (note) note.textContent = "Saving";
      saveTimer = setTimeout(() => { save(ctx.id, n, el.dataset.fl, el.value); const x = document.getElementById("fl-saved"); if (x) x.textContent = "Saved"; }, 600);
    });
    root.addEventListener("change", (e) => {
      if (e.target.matches("select[data-fl]")) save(ctx.id, n, e.target.dataset.fl, e.target.value);
      if (e.target.matches("[data-fl-file]") && e.target.files[0]) {
        const f = e.target.files[0];
        uploadFile(f, { projectId: ctx.id, section: "models-drawings" }).then(() => toast(`${f.name} uploaded.`, { ms: 3000 }), (err) => toast(err.message));
      }
    });
    root.addEventListener("submit", (e) => {
      e.preventDefault();
      const f = e.target;
      const v = f.querySelector("input")?.value.trim();
      if (!v) return;
      if (f.matches("[data-park]")) { store.add("entries", { projectId: ctx.id, type: "reflect", title: v, fields: {}, bodyMd: "", tags: [], partIds: [], skillIds: [], resourceIds: [], sessionSec: 0, taskId: null, parked: true }); parking = false; toast("Parked. It waits at the end of Flowstate.", { ms: 3000 }); return; }
      if (f.dataset.flAdd === "task") A.addTask(ctx.id, "plan", v);
      if (f.dataset.flAdd === "part") A.addBomLine(ctx.id, v);
      f.reset();
    });
  },
  acts: {
    "fl-go": (el) => {
      clearTimeout(saveTimer);
      const id = location.hash.split("/")[2].split("?")[0];
      const p = projectDefaults(store.get("projects", id));
      const cur = Math.min(7, Math.max(1, +(new URLSearchParams(location.hash.split("?")[1] || "").get("s") || p.station || 1)));
      store.update("projects", id, { stationState: leaveStation(p, cur, A.data()), station: +el.dataset.to });
      location.hash = `#/flow/${id}?s=${el.dataset.to}`;
    },
    "fl-new": () => { const [id, n] = here(); drafts.delete(`${id}:${n}`); rerender(); },
    "fl-kind": (el) => { const [id, n] = here(); const e = ent(id, n); if (e) store.update("entries", e.id, { type: el.dataset.t }); else kind5 = el.dataset.t; rerender(); },
    "fl-park": () => { parking = true; rerender(); },
    "fl-stuck": async () => { const [id, n] = here(); await copyText(stuckPrompt(projectDefaults(store.get("projects", id)), A.data(), n)); toast("Copied. Paste it into any AI; Fuse calls none itself.", { ms: 5000 }); },
    "fl-resume-ok": () => { resumeShownFor = here()[0]; rerender(); },
    "fl-reassemble": () => { const [id] = here(); const p = projectDefaults(store.get("projects", id)); const d = A.data(); const { undo } = store.undoable(() => store.update("projects", id, { writeup: assembleWriteup(p, d.entries) })); toast("Write-up assembled again from your notes.", { undo }); },
  },
};

let kind5 = "build";
const here = () => { const id = location.hash.split("/")[2].split("?")[0]; const p = store.get("projects", id); return [id, Math.min(7, Math.max(1, +(new URLSearchParams(location.hash.split("?")[1] || "").get("s") || p?.station || 1)))]; };
const setPath = (o, path, v) => { const ks = path.split("."); let x = o; ks.slice(0, -1).forEach((k) => { x[k] = { ...(x[k] || {}) }; x = x[k]; }); x[ks.at(-1)] = v; };

function save(pid, n, key, value) {
  const p = projectDefaults(store.get("projects", pid));
  const [scope, ...rest] = key.split(".");
  const path = rest.join(".");
  if (scope === "p") {
    if (path === "budgetCapIdr") { import("../util.js").then(({ parseIdr }) => store.update("projects", pid, { budgetCapIdr: parseIdr(value) })); return; }
    store.update("projects", pid, { [path]: value });
  } else if (scope === "pr") {
    store.update("projects", pid, { problem: { ...p.problem, [path]: value } });
  } else if (scope === "m") {
    const sm = { ...p.problem.successMeasure, [path]: path === "value" ? (value === "" ? null : +String(value).replace(",", ".")) : value };
    if (path === "value" && !Number.isFinite(sm.value)) sm.value = value === "" ? null : value;
    store.update("projects", pid, { problem: { ...p.problem, successMeasure: sm } });
  } else if (scope === "r") {
    store.update("projects", pid, { testResult: { ...(p.testResult || {}), [path]: value } });
  } else if (scope === "e") {
    const k = `${pid}:${n}`;
    const type = n === 2 ? "study" : n === 3 ? "decision" : kind5;
    let e = store.get("entries", drafts.get(k));
    if (!e) {
      e = store.add("entries", { projectId: pid, type, title: "", fields: {}, bodyMd: "", tags: [], partIds: [], skillIds: [], resourceIds: [], sessionSec: 0, taskId: null });
      drafts.set(k, e.id);
      store.saveSettings({ entriesSinceBackup: (store.settings().entriesSinceBackup || 0) + 1 });
    }
    const next = { title: e.title, fields: { ...(e.fields || {}) }, bodyMd: e.bodyMd };
    setPath(next, path, value);
    if (n === 3 && path === "title") next.fields.choice = value;
    if (n === 2 && path === "title") next.fields.concept = next.fields.concept || "";
    store.update("entries", e.id, next);
  }
}

async function rerender() { const { render } = await import("../app.js"); render(); }
