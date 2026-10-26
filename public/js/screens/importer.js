// Import a plan: copy the prompt, paste the reply, check, review as an editable draft, import.
// The draft lives only on this device until Import. Imported text is shown as plain text, never HTML.
import * as store from "../store.js";
import * as A from "../actions.js";
import { html, raw, rp, copyText, parseIdr, splitTags, searchLinks } from "../util.js";
import { icon, toast } from "../ui.js";
import { buildPrompt } from "../../import/prompt.js";
import { check, fixRequest, STAGES, PROOFS } from "../../import/validate.js";

const KEY = "fuse.import";
let st = null;
const load = () => { if (!st) { try { st = JSON.parse(localStorage.getItem(KEY) || "null"); } catch {} st ||= { raw: "", ctx: true, result: null, original: null, draft: null }; } return st; };
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { toast("The draft is too large to autosave on this device."); } };
const rerender = async () => { const { render } = await import("../app.js"); render(); };

function attachWarnings(plan, warnings) {
  let n = 0;
  const general = [];
  for (const w of warnings) {
    const m = /^(parts|tasks|skills|resources|risks)\[(\d+)\]/.exec(w.path);
    const item = m ? plan[m[1]]?.[+m[2]] : w.path.startsWith("project.") ? plan.project : null;
    const entry = { id: `w${n++}`, msg: w.msg, path: w.path };
    if (item) (item._w ||= []).push(entry); else general.push(entry);
  }
  plan._w = general;
  return plan;
}

const promptText = (withCtx) => {
  const lv = A.levels();
  return buildPrompt({
    skills: store.all("skills").map((s) => ({ name: s.name, level: lv.get(s.id)?.level || 0 })),
    parts: store.all("parts"), budget: store.settings().defaultBudgetIdr, includeContext: withCtx,
  });
};

const warnList = (item) => (item?._w || []).filter((w) => !w.off).map((w) => html`<span class="st warn" style="white-space:normal">${w.msg}</span><button class="btn s ghost" data-act="w-off" data-w="${w.id}">Dismiss</button>`);

function plannedTotal(dr) {
  return dr.parts.filter((p) => p.include !== false && !p.owned && !(p.match && p.useMatch !== false)).reduce((n, p) => n + (p.priceIdr || 0) * (p.qty || 1), 0);
}

function review(dr) {
  const total = plannedTotal(dr);
  const cap = dr.project.budgetCapIdr;
  const pct = cap ? Math.min(100, (total / cap) * 100) : 0;
  const inc = (x) => x.include !== false;
  const field = (path, value, opts = {}) => html`<input class="bare ${opts.cls || ""}" data-dr="${path}" data-type="${opts.type || "text"}" value="${value ?? ""}" placeholder="${opts.ph || ""}" aria-label="${opts.label || path}" ${opts.num ? raw('inputmode="numeric"') : ""} style="${opts.style || ""}">`;
  return html`
  <section class="step ok"><h2>Review the draft</h2><p class="muted">Nothing is saved yet. Every field is editable. Untick anything you do not want.</p>
    ${dr._w?.filter((w) => !w.off).length ? html`<ul class="msgs" style="margin-top:12px">${dr._w.filter((w) => !w.off).map((w) => html`<li><span class="st warn"></span><span><code>${w.path}</code> ${w.msg}</span><button class="btn s ghost" data-act="w-off" data-w="${w.id}">Dismiss</button></li>`)}</ul>` : ""}
    <div class="panel stack" style="margin-top:16px">
      <div class="grid2" style="gap:12px">
        <label class="f"><span>Project name</span>${field("project.name", dr.project.name, { label: "Project name" })}</label>
        <label class="f"><span>Track</span>${field("project.track", dr.project.track, { label: "Track" })}</label>
      </div>
      <label class="f"><span>Summary</span>${field("project.summary", dr.project.summary, { label: "Summary" })}</label>
      <label class="f"><span>Aims, one per line</span><textarea class="in" data-dr="project.aims" data-type="lines" aria-label="Aims">${(dr.project.aims || []).join("\n")}</textarea></label>
      <label class="f"><span>Next smallest action (blank uses the task list)</span>${field("project.nextAction", dr.project.nextAction, { label: "Next action" })}</label>
      <div class="row">${warnList(dr.project)}</div>
      <div class="stack s"><div class="spread"><span class="label">Budget</span><span class="mono">${rp(total)} of ${cap ? rp(cap) : "no cap"}</span></div>
        <div class="meter${cap && total > cap ? " over" : ""}"><i style="width:${cap ? pct : 0}%"></i></div>
        <label class="f" style="max-width:240px"><span>Cap, Rp</span>${field("project.budgetCapIdr", cap == null ? "" : new Intl.NumberFormat("id-ID").format(cap), { type: "idr", num: true, label: "Budget cap" })}</label></div>
    </div>

    <div class="panel" style="margin-top:16px"><div class="panel-h"><h3>Parts <span class="mono muted">${dr.parts.filter(inc).length}/${dr.parts.length}</span></h3><button class="btn s" data-act="add-part">Add part</button></div>
      ${dr.parts.map((p, i) => html`<div class="draft-item${inc(p) ? "" : " off"}">
        <label class="check" style="justify-content:center"><input type="checkbox" data-act="inc" data-p="parts.${i}" ${inc(p) ? raw("checked") : ""} aria-label="Include ${p.name}"></label>
        <div class="fields">${field(`parts.${i}.name`, p.name, { label: "Part name" })}
          <span class="row" style="gap:4px;flex-wrap:nowrap"><span class="label">Qty</span>${field(`parts.${i}.qty`, p.qty, { type: "int", num: true, cls: "num-in", style: "width:4em", label: "Quantity" })}</span>
          <span class="row" style="gap:4px;flex-wrap:nowrap"><span class="label">Rp</span>${p.owned || (p.match && p.useMatch !== false) ? html`<span class="from-inv">From inventory · Rp 0</span>` : field(`parts.${i}.priceIdr`, p.priceIdr == null ? "" : new Intl.NumberFormat("id-ID").format(p.priceIdr), { type: "idr", num: true, cls: "num-in", ph: "unpriced", label: "Unit price" })}</span>
          <label class="check"><input type="checkbox" data-act="flag" data-p="parts.${i}.owned" ${p.owned ? raw("checked") : ""}>I own it</label></div>
        <button class="btn s icon ghost" data-act="del" data-p="parts.${i}" aria-label="Delete part">${icon("trash")}</button>
        <div class="w">${p.match ? html`<button class="chip ${p.useMatch !== false ? "on" : ""}" data-act="flag" data-p="parts.${i}.useMatch" data-default="true">${p.useMatch !== false ? "Using my inventory item" : "Use my inventory item"}</button>` : ""}
          ${warnList(p)}${p.searchQuery ? searchLinks(p.searchQuery).map((x) => html`<a class="tag" href="${x.url}" target="_blank" rel="noopener noreferrer">${x.shop}: ${p.searchQuery}</a>`) : ""}${p.purpose ? html`<span class="muted">${p.purpose}</span>` : ""}</div>
      </div>`)}
    </div>

    <div class="panel" style="margin-top:16px"><div class="panel-h"><h3>Tasks <span class="mono muted">${dr.tasks.filter(inc).length}/${dr.tasks.length}</span></h3><button class="btn s" data-act="add-task">Add task</button></div>
      ${dr.tasks.map((t, i) => html`<div class="draft-item${inc(t) ? "" : " off"}">
        <label class="check" style="justify-content:center"><input type="checkbox" data-act="inc" data-p="tasks.${i}" ${inc(t) ? raw("checked") : ""} aria-label="Include ${t.title}"></label>
        <div class="fields">
          <select class="bare" data-dr="tasks.${i}.stage" style="width:auto" aria-label="Stage">${STAGES.map((s) => html`<option ${s === t.stage ? raw("selected") : ""}>${s}</option>`)}</select>
          ${field(`tasks.${i}.title`, t.title, { label: "Task title" })}
          <span class="row" style="gap:4px;flex-wrap:nowrap">${field(`tasks.${i}.estMinutes`, t.estMinutes, { type: "int", num: true, cls: "num-in", style: "width:4em", label: "Minutes" })}<span class="label">min</span></span></div>
        <span class="tools row" style="gap:0;flex-wrap:nowrap">
          <button class="btn s icon ghost" data-act="mv" data-i="${i}" data-dir="-1" aria-label="Move up">${icon("up")}</button>
          <button class="btn s icon ghost" data-act="mv" data-i="${i}" data-dir="1" aria-label="Move down">${icon("down")}</button>
          <button class="btn s icon ghost" data-act="del" data-p="tasks.${i}" aria-label="Delete task">${icon("trash")}</button></span>
        <div class="w" style="display:grid;gap:4px">
          <input class="bare" data-dr="tasks.${i}.detail" value="${t.detail || ""}" placeholder="Detail" aria-label="Detail" style="font-size:13px">
          <div class="row" style="gap:4px">
            <span class="label">Skills</span><input class="bare" data-dr="tasks.${i}.skills" data-type="tags" value="${(t.skills || []).join(", ")}" placeholder="none" aria-label="Skills" style="font-size:13px;flex:1;min-width:160px">
            ${PROOFS.map((k) => html`<button class="chip ${(t.proof || []).includes(k) ? "on" : ""}" data-act="proof" data-i="${i}" data-k="${k}">${k}</button>`)}
            ${i < dr.tasks.length - 1 ? html`<button class="btn s ghost" data-act="merge" data-i="${i}">Merge with next</button>` : ""}<button class="btn s ghost" data-act="split" data-i="${i}">Split</button>
          </div>
          ${(t.partRefs || []).length ? html`<span class="muted">Parts: ${t.partRefs.map((r) => dr.parts.find((p) => p.ref === r)?.name || r).join(", ")}</span>` : ""}
          ${(t.dependsOn || []).length ? html`<span class="muted">After: ${t.dependsOn.map((r) => dr.tasks.find((x) => x.ref === r)?.title || r).join(", ")}</span>` : ""}
          <div class="row">${warnList(t)}</div></div>
      </div>`)}
    </div>

    <div class="grid2" style="margin-top:16px">
      <div class="panel"><h3>Skills</h3>${dr.skills.map((s, i) => html`<div class="draft-item${inc(s) ? "" : " off"}">
        <label class="check" style="justify-content:center"><input type="checkbox" data-act="inc" data-p="skills.${i}" ${inc(s) ? raw("checked") : ""} aria-label="Include ${s.name}"></label>
        <div class="fields">${field(`skills.${i}.name`, s.name, { label: "Skill name" })}${field(`skills.${i}.domain`, s.domain, { ph: "Domain", label: "Domain", style: "max-width:12em" })}</div>
        <span>${s.matchId && s.useMatch !== false ? html`<span class="chip">Yours: ${s.matchName}</span>` : html`<span class="chip dash">New, unproven</span>`}</span></div>`)}
        ${dr.skills.length ? "" : html`<p class="muted">No skills named.</p>`}</div>
      <div class="panel stack s"><h3>Resources and risks</h3>
        ${dr.resources.map((r, i) => html`<label class="check"><input type="checkbox" data-act="inc" data-p="resources.${i}" ${inc(r) ? raw("checked") : ""}><span><span class="chip">${r.type}</span> ${r.title}${r.note ? html` <span class="muted">· ${r.note}</span>` : ""}</span></label>${warnList(r)}`)}
        ${dr.risks.map((r, i) => html`<label class="check"><input type="checkbox" data-act="inc" data-p="risks.${i}" ${inc(r) ? raw("checked") : ""}><span class="st warn" style="white-space:normal">${r.text}${r.mitigation ? ` Mitigation: ${r.mitigation}` : ""}</span></label>`)}
        ${dr.resources.length + dr.risks.length ? "" : html`<p class="muted">None.</p>`}</div>
    </div>
    <div class="sticky-foot row end"><button class="btn ghost" data-act="reset">Reset to original</button><button class="btn ghost" data-act="clear">Clear draft</button><button class="btn hot" data-act="import" style="min-height:52px;padding:0 28px">${icon("upload")}Import plan</button></div>
  </section>`;
}

export default {
  title: "Import a plan",
  render() {
    const s = load();
    const r = s.result;
    const batches = store.all("importBatches").filter((b) => !b.undone).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3);
    return html`
      <div class="page-h"><h1>AI drafts. <b class="grad-text">You decide.</b></h1></div>
      <div class="steps">
        <section class="step ok"><h2>Copy the prompt</h2>
          <p class="muted">Paste it into any AI, fill in the four lines at the top, and send.</p>
          <label class="check"><input type="checkbox" data-act="ctx" ${s.ctx ? raw("checked") : ""}>Include my inventory and skills</label>
          <pre class="snip prompt-box">${promptText(s.ctx)}</pre>
          <div class="row" style="margin-top:8px"><button class="btn primary" data-act="copy-prompt">${icon("copy")}Copy prompt</button></div>
        </section>
        <section class="step${s.raw ? " ok" : ""}"><h2>Paste the reply</h2>
          <p class="muted">Chat text around the JSON is fine. You can also drop a .json file here.</p>
          <div class="drop" data-drop><textarea class="in" id="imp-raw" data-k="imp-raw" placeholder='{"schema":"fuse.project/1", ...}' aria-label="AI reply">${s.raw}</textarea></div>
          <div class="row" style="margin-top:8px"><button class="btn primary" data-act="check">Check</button><label class="btn" style="cursor:pointer">${icon("file")}Open .json<input type="file" accept=".json,application/json,text/plain" class="sr" data-file></label></div>
        </section>
        ${r ? html`<section class="step${r.errors.length ? "" : " ok"}"><h2>Check</h2>
          ${r.errors.length ? html`<p class="st bad">${r.errors.length} error${r.errors.length === 1 ? "" : "s"}. They block the import.</p>
            <ul class="msgs" style="margin-top:8px">${r.errors.map((e) => html`<li><span class="st bad"></span><span><code>${e.path}</code> ${e.msg}</span><span></span></li>`)}</ul>
            <div class="row" style="margin-top:12px"><button class="btn primary" data-act="copy-fix">${icon("copy")}Copy fix request</button></div>`
          : html`<p class="st ok">Valid fuse.project/1. ${r.warnings.length} warning${r.warnings.length === 1 ? "" : "s"}, shown next to their fields.</p>`}
        </section>` : ""}
        ${s.draft ? review(s.draft) : ""}
      </div>
      ${batches.length ? html`<hr class="fuse-rule"><section class="stack s"><p class="label">Recent imports</p>${batches.map((b) => html`<div class="row"><span class="mono subtle">${b.createdAt.slice(0, 10)}</span><a href="#/p/${b.projectId}">${store.get("projects", b.projectId)?.name || "Project"}</a><span class="muted">${Object.entries(b.counts || {}).map(([k, v]) => `${v} ${k}`).join(", ")}</span><button class="btn s" data-act="undo-import" data-id="${b.id}">Undo import</button></div>`)}</section>` : ""}`;
  },
  mount(root) {
    const s = load();
    const ta = root.querySelector("#imp-raw");
    ta?.addEventListener("input", () => { s.raw = ta.value; save(); });
    const drop = root.querySelector("[data-drop]");
    const readFile = async (f) => { s.raw = await f.text(); save(); runCheck(); };
    drop?.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
    drop?.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop?.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); const f = e.dataTransfer.files[0]; if (f) readFile(f); });
    root.querySelector("[data-file]")?.addEventListener("change", (e) => { const f = e.target.files[0]; if (f) readFile(f); });
    root.addEventListener("change", (e) => {
      const el = e.target.closest("[data-dr]");
      if (!el) return;
      const t = el.dataset.type;
      let v = el.value;
      if (t === "int") { const n = parseInt(v, 10); v = Number.isFinite(n) ? (el.dataset.dr.endsWith("qty") ? Math.max(1, n) : n) : null; }
      if (t === "idr") v = parseIdr(v);
      if (t === "tags") v = splitTags(v);
      if (t === "lines") v = v.split("\n").map((x) => x.trim()).filter(Boolean);
      if (t === "text" || !t) v = v.trim();
      setAt(s.draft, el.dataset.dr, v);
      save(); rerender();
    });
  },
  acts: {
    ctx: (el) => { const s = load(); s.ctx = el.checked; save(); rerender(); },
    "copy-prompt": async () => { await copyText(promptText(load().ctx)); toast("Prompt copied. Paste it into your AI.", { ms: 4000 }); },
    check: () => { const s = load(); s.raw = document.getElementById("imp-raw")?.value ?? s.raw; save(); runCheck(); },
    "copy-fix": async () => { await copyText(fixRequest(load().result.errors)); toast("Fix request copied. Send it to the AI and paste its new reply.", { ms: 5000 }); },
    inc: (el) => { const s = load(); const it = getAt(s.draft, el.dataset.p); it.include = el.checked; save(); rerender(); },
    flag: (el) => { const s = load(); const path = el.dataset.p; const cur = getAt(s.draft, path); setAt(s.draft, path, cur === undefined ? !(el.dataset.default === "true") : !cur); save(); rerender(); },
    del: (el) => {
      const s = load(); const [col, i] = el.dataset.p.split(".");
      const removed = s.draft[col].splice(+i, 1)[0]; save(); rerender();
      toast(`Deleted from the draft.`, { undo: () => { s.draft[col].splice(+i, 0, removed); save(); rerender(); } });
    },
    mv: (el) => { const s = load(); const i = +el.dataset.i, j = i + +el.dataset.dir; const a = s.draft.tasks; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; save(); rerender(); },
    proof: (el) => { const s = load(); const t = s.draft.tasks[+el.dataset.i]; const k = el.dataset.k; t.proof = (t.proof || []).includes(k) ? t.proof.filter((x) => x !== k) : [...(t.proof || []), k]; save(); rerender(); },
    "add-task": () => { const s = load(); s.draft.tasks.push({ ref: `t_new${Date.now()}`, stage: "build", title: "New task", detail: "", estMinutes: 30, partRefs: [], skills: [], proof: [], dependsOn: [] }); save(); rerender(); },
    "add-part": () => { const s = load(); s.draft.parts.push({ ref: `p_new${Date.now()}`, name: "New part", category: "", qty: 1, priceIdr: null, searchQuery: "", purpose: "", owned: false, tags: [] }); save(); rerender(); },
    merge: (el) => {
      const s = load(); const i = +el.dataset.i; const a = s.draft.tasks[i], b = s.draft.tasks[i + 1];
      const u = (x, y) => [...new Set([...(x || []), ...(y || [])])];
      Object.assign(a, { title: `${a.title}, then ${b.title}`, detail: [a.detail, b.detail].filter(Boolean).join(" "), estMinutes: Math.min(240, (a.estMinutes || 0) + (b.estMinutes || 0)) || null,
        partRefs: u(a.partRefs, b.partRefs), skills: u(a.skills, b.skills), proof: u(a.proof, b.proof), dependsOn: u(a.dependsOn, b.dependsOn).filter((r) => r !== a.ref && r !== b.ref) });
      s.draft.tasks.splice(i + 1, 1);
      for (const t of s.draft.tasks) t.dependsOn = [...new Set((t.dependsOn || []).map((r) => (r === b.ref ? a.ref : r)))].filter((r) => r !== t.ref);
      save(); rerender();
    },
    split: (el) => {
      const s = load(); const i = +el.dataset.i; const a = s.draft.tasks[i];
      const b = { ...structuredClone(a), ref: `${a.ref}_b${Date.now() % 1000}`, title: `${a.title} (part 2)`, dependsOn: [a.ref], _w: [] };
      if (a.estMinutes) { a.estMinutes = Math.max(5, Math.round(a.estMinutes / 2)); b.estMinutes = a.estMinutes; }
      s.draft.tasks.splice(i + 1, 0, b); save(); rerender();
    },
    "w-off": (el) => { const s = load(); const walk = (o) => { if (!o || typeof o !== "object") return; if (Array.isArray(o._w)) for (const w of o._w) if (w.id === el.dataset.w) w.off = true; Object.values(o).forEach((v) => typeof v === "object" && walk(v)); }; walk(s.draft); save(); rerender(); },
    reset: () => { const s = load(); const prev = s.draft; s.draft = structuredClone(s.original); save(); rerender(); toast("Draft reset to the pasted version.", { undo: () => { s.draft = prev; save(); rerender(); } }); },
    clear: () => { const prev = st; st = { raw: "", ctx: prev.ctx, result: null, original: null, draft: null }; save(); rerender(); toast("Import draft cleared.", { undo: () => { st = prev; save(); rerender(); } }); },
    import: () => {
      const s = load();
      const dr = s.draft;
      if (!String(dr.project.name || "").trim()) { toast("The project needs a name."); return; }
      const { project, batch } = A.importPlan(dr, s.raw);
      st = { raw: "", ctx: s.ctx, result: null, original: null, draft: null }; save();
      location.hash = `#/p/${project.id}`;
      toast(`Imported ${project.name}.`, { undo: () => A.undoImport(batch.id), ms: 10000 });
    },
    "undo-import": (el) => A.undoImport(el.dataset.id),
  },
};

function runCheck() {
  const s = load();
  const r = check(s.raw, { parts: store.all("parts"), skills: store.all("skills") });
  s.result = { errors: r.errors, warnings: r.warnings };
  if (r.plan) { s.original = attachWarnings(r.plan, r.warnings); s.draft = structuredClone(s.original); }
  else { s.original = null; s.draft = null; }
  save(); rerender();
}

const getAt = (o, p) => p.split(".").reduce((x, k) => x?.[k], o);
const setAt = (o, p, v) => { const ks = p.split("."); const last = ks.pop(); ks.reduce((x, k) => x[k], o)[last] = v; };
