// Entry editor as a console. Typed templates, evidence side panel, skill chips with pending levels,
// session timer. The draft autosaves locally every few seconds and survives a crash or a closed tab.
import * as store from "../store.js";
import * as A from "../actions.js";
import * as db from "../db.js";
import { html, raw, uid, clock, stamp, today, splitTags, parseIdr, b64FromBytes, bytesFromB64, safeUrl, esc } from "../util.js";
import { icon, toast } from "../ui.js";
import { pendingLevels, PROOF_KINDS } from "../derive.js";
import { compress, objectUrl, cachedUrl } from "../photos.js";

export const TYPES = ["build", "fail", "decision", "experiment", "study", "design", "purchase", "reflect"];
// [path, label, placeholder, rows]. MAIN is the one prompt shown up front; DETAIL sits under "Add detail".
const MAIN = {
  build: [["bodyMd", "What you did", "What you made today, what worked", 3]],
  fail: [["fields.symptom", "Symptom", "What you saw", 2]],
  decision: [["fields.choice", "The choice", "What you picked"]],
  experiment: [["fields.setup", "What you tried", "Parts, wiring, conditions", 2]],
  study: [["fields.concept", "The concept", "Ohm's law, torque, PID", 2]],
  design: [["fields.options", "The options", "One option per line", 3]],
  purchase: [["purchase.name", "Part", "Which part?"], ["purchase.qty", "Qty", "1"], ["purchase.priceIdr", "Unit price", "Rp 28.000"], ["purchase.shop", "Shop", "Shopee"], ["purchase.date", "Date", "2026-10-26"]],
  reflect: [["bodyMd", "Reflection", "What you learned. Tag it taught when it explains a skill to someone else", 4]],
};
const DETAIL = {
  build: [],
  fail: [["fields.hypothesis", "Hypothesis", "What you think caused it", 2], ["fields.fix", "Fix", "What you changed", 2], ["fields.rootCause", "Root cause", "Why it really happened", 2], ["bodyMd", "Notes", "", 2]],
  decision: [["fields.question", "Context", "The choice you faced"], ["fields.options", "Options considered", "One option per line", 3], ["fields.why", "Why", "The reason, in one or two lines", 2], ["fields.changeMyMind", "What would change my mind", "A result or fact that would flip this", 2]],
  experiment: [["fields.hypothesis", "Hypothesis", "What you expect", 2], ["__measure", "Measurements"], ["fields.result", "Result", "What the numbers say", 2]],
  study: [["fields.whyItMatters", "Why it matters for this build", "", 2], ["fields.equations", "Equations", "V = I R  (V, A, ohm)", 3], ["fields.workedExample", "Worked example", "5 V / 220 ohm = 22.7 mA", 3], ["fields.howToTest", "How I would test this", "", 2]],
  design: [["fields.choice", "Choice", "The option you picked"], ["fields.why", "Why", "", 2], ["bodyMd", "Notes", "Attach the model or sketch files on the project Notebook", 2]],
  purchase: [["bodyMd", "Notes", "", 2]],
  reflect: [],
};
const detailKey = (t) => `fuse.detail.${t}`;
const detailOpen = (t) => { try { return localStorage.getItem(detailKey(t)) === "1"; } catch { return false; } };

let draft = null, draftKey = null, restored = false, adding = null, saveTimer = null, tick = null;

const keyFor = (ctx) => (ctx.id && ctx.id !== "new" ? `fuse.draft.${ctx.id}` : "fuse.draft.new");
const getPath = (o, p) => p.split(".").reduce((x, k) => (x == null ? x : x[k]), o);
const setPath = (o, p, v) => { const ks = p.split("."); let x = o; ks.slice(0, -1).forEach((k) => { x = x[k] ||= {}; }); x[ks.at(-1)] = v; };
const hms = () => new Date().toTimeString().slice(0, 8);
const elapsed = () => (draft.sessionSec || 0) + (draft.timerStart ? (Date.now() - draft.timerStart) / 1000 : 0);

function persist() {
  if (!draft) return;
  try { localStorage.setItem(draftKey, JSON.stringify(draft)); }
  catch {
    try { // too big: keep photos in memory only, save the text
      localStorage.setItem(draftKey, JSON.stringify({ ...draft, evidence: draft.evidence.map((e) => (e.kind === "photo" ? { ...e, fullB64: null, thumbB64: null, lostPhoto: true } : e)) }));
    } catch {}
  }
}
const persistSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(persist, 800); };

function freshDraft(ctx) {
  const q = ctx.query;
  const task = q.task && store.get("tasks", q.task);
  const active = A.activeProject();
  const type = TYPES.includes(q.type) ? q.type : "build";
  return {
    type, projectId: q.project || task?.projectId || active?.id || null, title: task ? task.title : "", fields: {}, bodyMd: "",
    tags: task ? [] : [], partIds: task?.partIds || [], skillIds: task?.skillIds || [], resourceIds: [], sessionSec: 0, timerStart: null,
    taskId: task?.id || null, evidence: [], times: {}, startedAt: new Date().toISOString(),
    purchase: { name: "", qty: 1, priceIdr: "", shop: "Shopee", date: today() },
  };
}

let loadedRoute = null;
function load(ctx) {
  if (draft && loadedRoute === location.hash) return;
  loadedRoute = location.hash;
  draftKey = keyFor(ctx);
  restored = false; adding = null;
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(draftKey) || "null"); } catch {}
  const isNew = !ctx.id || ctx.id === "new";
  // An unsaved draft always wins over a fresh one, so nothing typed is ever lost.
  if (saved && draftHasContent(saved)) { draft = saved; restored = true; return; }
  if (isNew) { draft = freshDraft(ctx); return; }
  const e = store.get("entries", ctx.id);
  if (!e) { draft = null; return; }
  draft = { id: e.id, type: e.type, projectId: e.projectId, title: e.title || "", fields: { ...(e.fields || {}) }, bodyMd: e.bodyMd || "", tags: e.tags || [], partIds: e.partIds || [],
    skillIds: e.skillIds || [], resourceIds: e.resourceIds || [], sessionSec: e.sessionSec || 0, timerStart: null, taskId: e.taskId || null, evidence: [], times: {}, startedAt: e.createdAt, purchase: {} };
}
const draftHasContent = (d) => d.title || d.bodyMd || Object.values(d.fields || {}).some(Boolean) || d.evidence.length || d.sessionSec || d.timerStart || d.purchase?.name;

const titlePh = (t) => ({ build: "What did you build?", fail: "What broke?", decision: "What did you decide?", experiment: "What are you testing?", study: "What are you learning?", design: "What are you designing?", reflect: "What did you learn?" }[t] || "Title");

function cline(path, label, ph, rows) {
  const v = getPath(draft, path) ?? "";
  const t = draft.times?.[path] || "--:--:--";
  const id = `d-${path.replace(/\./g, "-")}`;
  const attrs = raw(`data-k="${id}" id="${id}" data-d="${esc(path)}" placeholder="${esc(ph || "")}"`);
  const input = path === "purchase.name"
    ? html`<input ${attrs} list="ed-parts" autocomplete="off" value="${v}">`
    : path === "purchase.date" ? html`<input ${attrs} type="date" value="${v}">`
    : rows ? html`<textarea ${attrs} rows="${rows}">${v}</textarea>` : html`<input ${attrs} value="${v}" ${path.startsWith("purchase.") && path !== "purchase.shop" ? raw('inputmode="numeric"') : ""}>`;
  return html`<div class="cline"><span class="ts">${t}</span><label class="lb" for="${id}">${label}</label>${input}</div>`;
}

function measureTable() {
  const saved = draft.id ? store.all("evidence").filter((e) => e.entryId === draft.id && e.kind === "measurement") : [];
  const rows = draft.evidence.filter((e) => e.kind === "measurement");
  return html`<div class="cline"><span class="ts">${draft.times?.measure || "--:--:--"}</span><span class="lb">Measurements</span>
    <div><table class="mtab"><thead><tr><th>What</th><th>Value</th><th>Unit</th><th></th></tr></thead><tbody>
      ${saved.map((e) => html`<tr><td>${e.caption}</td><td class="mono">${e.value}</td><td>${e.unit}</td><td></td></tr>`)}
      ${rows.map((e) => html`<tr><td><input data-k="m-${e.id}-c" data-ev="${e.id}.caption" value="${e.caption || ""}" placeholder="distance at stop"></td><td><input data-k="m-${e.id}-v" data-ev="${e.id}.value" value="${e.value ?? ""}" inputmode="decimal" placeholder="19.6"></td><td><input data-k="m-${e.id}-u" data-ev="${e.id}.unit" value="${e.unit || ""}" placeholder="cm" style="width:5em"></td><td><button class="cbtn" data-act="ev-del" data-id="${e.id}" aria-label="Remove row">x</button></td></tr>`)}
    </tbody></table><button class="cbtn" data-act="m-row" style="margin-top:6px">+ Add row</button></div></div>`;
}

function evThumb(e) {
  if (e.kind === "photo") {
    const src = e.thumbB64 ? `data:image/jpeg;base64,${e.thumbB64}` : e.thumbId && cachedUrl(e.thumbId);
    return src ? html`<span class="th"><img src="${src}" alt="${e.caption || "Photo"}"></span>` : html`<span class="th" data-thumb="${e.thumbId || ""}">photo</span>`;
  }
  return html`<span class="th">${e.kind === "measurement" ? "unit" : e.kind === "snippet" ? "</>" : "link"}</span>`;
}
const evBody = (e) => e.kind === "measurement" ? html`<span><b class="mono">${e.value} ${e.unit}</b> ${e.caption}</span>`
  : e.kind === "snippet" ? html`<pre>${e.text}</pre>` : e.kind === "link" ? html`<span class="mono" style="font-size:13px;word-break:break-all">${e.text}</span>` : html`<span>${e.caption || "Photo"}${e.lostPhoto ? html` <span class="st bad">Photo not autosaved. Add it again.</span>` : ""}</span>`;

export default {
  title: (ctx) => (ctx.id && ctx.id !== "new" ? "Edit entry" : "New entry"),
  render(ctx) {
    load(ctx);
    if (!draft) return html`<div class="empty">This entry is not here. It may be archived.<a class="btn" href="#/archive">Open the archive</a></div>`;
    const d = A.data();
    const projects = store.all("projects");
    const skills = store.all("skills");
    const lv = A.levels();
    const saved = draft.id ? store.all("evidence").filter((e) => e.entryId === draft.id) : [];
    const draftEv = draft.evidence.filter((e) => e.kind !== "measurement" || String(e.value).trim());
    const pend = pendingLevels(d, { ...draft, createdAt: draft.startedAt }, draftEv);
    const hasProof = [...saved, ...draftEv].some((e) => PROOF_KINDS.has(e.kind));
    const task = draft.taskId && store.get("tasks", draft.taskId);
    const projSkills = new Set(store.all("tasks").filter((t) => t.projectId === draft.projectId).flatMap((t) => t.skillIds || []));
    const skillOrder = [...skills].sort((a, b) => (draft.skillIds.includes(b.id) - draft.skillIds.includes(a.id)) || (projSkills.has(b.id) - projSkills.has(a.id)) || a.name.localeCompare(b.name));
    const running = !!draft.timerStart;

    const used = new Set([...(task?.skillIds || []), ...projSkills, ...store.all("entries").filter((e) => e.projectId === draft.projectId).flatMap((e) => e.skillIds || []), ...draft.skillIds]);
    const near = skillOrder.filter((x) => used.has(x.id));
    const rest = skillOrder.filter((x) => !used.has(x.id));
    const chip = (s) => {
      const on = draft.skillIds.includes(s.id);
      const cur = lv.get(s.id)?.level || 0;
      const p = pend.get(s.id);
      if (on && p && (hasProof || p.after >= 2)) return html`<button class="chip hotc" data-act="skill" data-id="${s.id}" aria-pressed="true">${s.name} <span class="lv">LV ${p.before} → ${p.after} pending</span></button>`;
      if (on && p) return html`<button class="chip dash on" data-act="skill" data-id="${s.id}" aria-pressed="true">${s.name} <span class="lv">LV ${p.before} → ${p.after} pending · needs proof for LV 2</span></button>`;
      if (on && !hasProof && cur < 2) return html`<button class="chip dash on" data-act="skill" data-id="${s.id}" aria-pressed="true">${s.name} <span class="lv">needs proof</span></button>`;
      return html`<button class="chip ${on ? "on" : ""}" data-act="skill" data-id="${s.id}" aria-pressed="${on}">${s.name} <span class="lv">LV ${cur}</span></button>`;
    };
    const detailFields = DETAIL[draft.type] || [];
    const hasDetail = detailFields.some(([p]) => p !== "__measure" && String(getPath(draft, p) || "").trim()) || draft.evidence.length || draft.tags.length;
    const open = detailOpen(draft.type) || hasDetail || (task?.proofKinds || []).length;
    const canSave = draft.type === "purchase" ? !!String(draft.purchase?.name || "").trim() : !!String(draft.title || "").trim();

    return html`
    <div class="page-h"><h1>${draft.id ? "Edit" : "Log"} <b>${draft.type}.</b></h1>${restored ? html`<span class="st warn">Unsaved draft restored</span>` : ""}</div>
    ${task ? html`<p class="banner"><span>Proof for task: <b>${task.title}</b>${(task.proofKinds || []).length ? ` · capture ${task.proofKinds.join(", ")}` : ""}</span></p>` : ""}
    <div class="editor">
      <section class="console ed" style="--tc:var(--t-${draft.type})" aria-label="Entry">
        <div class="tbar" role="group" aria-label="Entry type">
          ${TYPES.map((t) => html`<button data-act="type" data-t="${t}" aria-pressed="${t === draft.type}" style="--tc:var(--t-${t})">${t}</button>`)}
          <span class="timer"><span class="clock mono" id="clock">${clock(elapsed())}</span><button class="cbtn" data-act="timer">${running ? "Pause" : draft.sessionSec ? "Resume" : "Start timer"}</button></span>
        </div>
        <div class="lines">
          <div class="cline"><span class="ts">${stamp(draft.startedAt).slice(11)}</span><label class="lb" for="d-project">Project</label>
            <select id="d-project" data-k="d-project" data-dsel="projectId"><option value="">No project</option>${projects.map((p) => html`<option value="${p.id}" ${p.id === draft.projectId ? raw("selected") : ""}>${p.name}</option>`)}</select></div>
          ${draft.type === "purchase" ? "" : cline("title", "Title", titlePh(draft.type))}
          ${draft.type === "purchase" ? "" : html`<p class="hint" id="title-hint" ${canSave ? raw("hidden") : ""}>Add a title to save.</p>`}
          ${MAIN[draft.type].map(([p, l, ph, rows]) => cline(p, l, ph, rows))}
        </div>
        <datalist id="ed-parts">${store.all("parts").map((p) => html`<option value="${p.name}">`)}</datalist>
      </section>

      <details class="more-detail" data-detail ${open ? raw("open") : ""}>
        <summary class="btn">Add detail</summary>
        <div class="stack" style="margin-top:12px">
        ${detailFields.length ? html`<section class="console ed" style="--tc:var(--t-${draft.type})" aria-label="More fields"><div class="lines">
          ${detailFields.map(([p, l, ph, rows]) => (p === "__measure" ? measureTable() : cline(p, l, ph, rows)))}
        </div></section>` : ""}
        <section class="console ed" style="--tc:var(--t-${draft.type})" aria-label="Tags"><div class="lines">
          <div class="cline"><span class="ts">${draft.times?.tags || "--:--:--"}</span><label class="lb" for="d-tags">Tags</label><input id="d-tags" data-k="d-tags" data-dtags value="${draft.tags.join(", ")}" placeholder="motor, pwm, taught"></div>
        </div></section>
        <section class="panel stack">
          <div class="panel-h"><h3>Evidence</h3>${hasProof ? html`<span class="st ok">Has proof</span>` : html`<span class="st warn">No proof yet</span>`}</div>
          <div class="row">
            <label class="btn s" style="cursor:pointer">${icon("camera")}Photo<input type="file" accept="image/*" capture="environment" data-photo class="sr" multiple></label>
            <button class="btn s" data-act="add" data-k="measurement">${icon("ruler")}Measure</button>
            <button class="btn s" data-act="add" data-k="snippet">${icon("code")}Snippet</button>
            <button class="btn s" data-act="add" data-k="link">${icon("link")}Link</button>
          </div>
          ${adding === "measurement" ? html`<form class="stack s" data-addf="measurement"><div class="row" style="flex-wrap:nowrap"><input class="in" name="value" placeholder="19.6" inputmode="decimal" aria-label="Value" required><input class="in" name="unit" placeholder="cm" aria-label="Unit" style="width:6em" required></div><input class="in" name="caption" placeholder="What was measured" aria-label="Caption"><button class="btn s primary">Add measurement</button></form>` : ""}
          ${adding === "snippet" ? html`<form class="stack s" data-addf="snippet"><textarea class="in mono" name="text" placeholder="Paste code or serial output" aria-label="Snippet" required></textarea><input class="in" name="caption" placeholder="Caption" aria-label="Caption"><button class="btn s primary">Add snippet</button></form>` : ""}
          ${adding === "link" ? html`<form class="stack s" data-addf="link"><input class="in" name="text" type="url" placeholder="https://" aria-label="Link" required><button class="btn s primary">Add link</button></form>` : ""}
          <div class="ev-list">
            ${saved.map((e) => html`<div class="ev">${evThumb(e)}${evBody(e)}<button class="btn s icon ghost" data-act="ev-archive" data-id="${e.id}" aria-label="Archive evidence">${icon("archive")}</button></div>`)}
            ${draft.evidence.filter((e) => e.kind !== "measurement" || draft.type !== "experiment").map((e) => html`<div class="ev">${evThumb(e)}${evBody(e)}<button class="btn s icon ghost" data-act="ev-del" data-id="${e.id}" aria-label="Remove">${icon("x")}</button></div>`)}
            ${saved.length + draft.evidence.length ? "" : html`<p class="muted">A photo, a measurement with a unit, or a snippet counts as proof. A link does not.</p>`}
          </div>
        </section>
        <section class="panel stack">
          <div class="panel-h"><h3>Skills</h3><a class="btn s ghost" href="#/skills">Edit skills</a></div>
          <div class="row">${near.map(chip)}${skills.length && !near.length ? html`<p class="muted">No skills linked to this project yet.</p>` : ""}${skills.length ? "" : html`<p class="muted">No skills yet. Add them on the Skills screen.</p>`}</div>
          ${rest.length ? html`<details><summary class="btn s ghost">All skills</summary><div class="row" style="margin-top:8px">${rest.map(chip)}</div></details>` : ""}
        </section>
        <section class="panel stack s">
          <h3>Parts used</h3>
          <div class="row">${draft.partIds.map((id) => store.get("parts", id)).filter(Boolean).map((p) => html`<button class="chip on" data-act="part-del" data-id="${p.id}" aria-label="Remove ${p.name}">${p.name} ×</button>`)}</div>
          <form data-addpart class="row"><input class="in" name="n" list="ed-parts" placeholder="Add a part" aria-label="Add a part used" style="flex:1"></form>
          <h3 style="margin-top:8px">Resources used</h3>
          <div class="row">${store.all("resources").map((r) => html`<button class="chip ${draft.resourceIds.includes(r.id) ? "on" : ""}" data-act="res" data-id="${r.id}">${r.title}</button>`)}${store.all("resources").length ? "" : html`<a class="muted" href="#/library">Add resources in the Library</a>`}</div>
        </section>
        </div>
      </details>
    </div>
    <div class="save-bar">
      <button class="btn primary" data-act="save" data-save ${canSave ? "" : raw("disabled")}>${icon("check")}Save entry</button>
      <button class="btn text" data-act="discard">${restored ? "Discard and start fresh" : "Discard draft"}</button>
    </div>`;
  },
  mount(root) {
    if (!draft) return;
    clearInterval(tick);
    tick = setInterval(() => {
      if (!root.isConnected) { clearInterval(tick); persist(); return; }
      const c = root.querySelector("#clock");
      if (c) c.textContent = clock(elapsed());
    }, 1000);
    root.addEventListener("input", (e) => {
      const t = e.target;
      if (t.dataset.d) {
        let v = t.value;
        if (t.dataset.d === "purchase.qty") v = parseInt(v, 10) || "";
        setPath(draft, t.dataset.d, v);
        draft.times[t.dataset.d] ||= hms();
        const lineTs = t.closest(".cline")?.querySelector(".ts"); if (lineTs) lineTs.textContent = draft.times[t.dataset.d];
        if (t.dataset.d === "title" || t.dataset.d === "purchase.name") {
          const ok = !!t.value.trim();
          root.querySelector("[data-save]")?.toggleAttribute("disabled", !ok);
          root.querySelector("#title-hint")?.toggleAttribute("hidden", ok);
        }
      } else if (t.dataset.ev) {
        const [id, f] = t.dataset.ev.split(".");
        const ev = draft.evidence.find((x) => x.id === id);
        if (ev) ev[f] = t.value;
        draft.times.measure ||= hms();
      } else if ("dtags" in t.dataset) { draft.tags = splitTags(t.value); draft.times.tags ||= hms(); }
      persistSoon();
    });
    root.addEventListener("change", async (e) => {
      const t = e.target;
      if (t.dataset.dsel) { draft[t.dataset.dsel] = t.value || null; persist(); }
      if (t.dataset.ev || "dtags" in t.dataset) rerender();
      if (t.matches("[data-photo]") && t.files.length) {
        for (const f of t.files) {
          try {
            const { full, thumb } = await compress(f);
            draft.evidence.push({ id: uid(), kind: "photo", caption: "", fullB64: b64FromBytes(full), thumbB64: b64FromBytes(thumb), bytes: full.length + thumb.length });
          } catch (err) { toast(`Could not read that photo: ${err.message}`); }
        }
        persist(); rerender();
      }
    });
    root.querySelector("[data-detail]")?.addEventListener("toggle", (e) => { try { localStorage.setItem(detailKey(draft.type), e.target.open ? "1" : "0"); } catch {} });
    root.addEventListener("submit", (e) => {
      const f = e.target;
      e.preventDefault();
      if (f.dataset.addf) {
        const v = Object.fromEntries(new FormData(f));
        if (f.dataset.addf === "link" && !safeUrl(v.text)) { toast("That does not look like a web link."); return; }
        draft.evidence.push({ id: uid(), kind: f.dataset.addf, caption: v.caption || "", value: v.value ?? "", unit: v.unit || "", text: v.text || "" });
        adding = null; persist(); rerender();
      }
      if ("addpart" in f.dataset) {
        const n = f.n.value.trim();
        if (!n) return;
        const { part } = A.findOrCreatePart(n);
        if (!draft.partIds.includes(part.id)) draft.partIds.push(part.id);
        persist(); rerender();
      }
    });
    // load thumbnails of saved photos
    root.querySelectorAll("[data-thumb]").forEach(async (el) => {
      const id = el.dataset.thumb;
      if (!id) return;
      try { const b = await db.getBlob(id); if (b) { objectUrl(id, b.data, b.mime); rerender(); } } catch {}
    });
  },
  acts: {
    type: (el) => { draft.type = el.dataset.t; persist(); rerender(); },
    timer: () => { if (draft.timerStart) { draft.sessionSec = elapsed(); draft.timerStart = null; } else draft.timerStart = Date.now(); persist(); rerender(); },
    skill: (el) => { const id = el.dataset.id; draft.skillIds = draft.skillIds.includes(id) ? draft.skillIds.filter((x) => x !== id) : [...draft.skillIds, id]; persist(); rerender(); },
    res: (el) => { const id = el.dataset.id; draft.resourceIds = draft.resourceIds.includes(id) ? draft.resourceIds.filter((x) => x !== id) : [...draft.resourceIds, id]; persist(); rerender(); },
    "part-del": (el) => { draft.partIds = draft.partIds.filter((x) => x !== el.dataset.id); persist(); rerender(); },
    add: (el) => { adding = adding === el.dataset.k ? null : el.dataset.k; rerender(); },
    "m-row": () => { draft.evidence.push({ id: uid(), kind: "measurement", caption: "", value: "", unit: "" }); draft.times.measure ||= hms(); persist(); rerender(); },
    "ev-del": (el) => { draft.evidence = draft.evidence.filter((x) => x.id !== el.dataset.id); persist(); rerender(); },
    "ev-archive": (el) => A.archiveWithUndo("evidence", el.dataset.id, "Evidence"),
    discard: () => {
      const keep = draft, key = draftKey;
      try { localStorage.removeItem(key); } catch {}
      draft = null; loadedRoute = null;
      toast("Draft discarded.", { undo: () => { try { localStorage.setItem(key, JSON.stringify(keep)); } catch {} draft = null; loadedRoute = null; rerender(); } });
      if (restored) rerender(); else history.back();
    },
    save: async (el) => {
      if (draft.type === "purchase" && !draft.id && !String(draft.purchase?.name || "").trim()) { toast("Name the part you bought."); return; }
      if (draft.type !== "purchase" && !String(draft.title || "").trim()) { toast("Add a title to save."); document.getElementById("d-title")?.focus(); return; }
      el.disabled = true;
      const before = A.levels();
      const sec = elapsed();
      const d = {
        ...draft, sessionSec: sec,
        evidence: draft.evidence.filter((e) => e.kind !== "measurement" || String(e.value).trim()).map((e) => (e.kind === "photo" && e.fullB64 ? { ...e, full: bytesFromB64(e.fullB64), thumb: bytesFromB64(e.thumbB64) } : e)).filter((e) => e.kind !== "photo" || e.full),
        purchase: draft.type === "purchase" ? { ...draft.purchase, priceIdr: parseIdr(draft.purchase.priceIdr), qty: parseInt(draft.purchase.qty, 10) || 1 } : null,
      };
      try {
        const entry = await A.saveEntry(d);
        try { localStorage.removeItem(draftKey); } catch {}
        const after = A.levels();
        const ups = [...after].filter(([id, l]) => l.level > (before.get(id)?.level || 0)).map(([id, l]) => `${store.get("skills", id)?.name} LV ${l.level}`);
        draft = null; loadedRoute = null;
        toast(ups.length ? `Saved. ${ups.join(", ")}.` : "Saved.", { ms: 5000 });
        location.hash = entry.projectId ? `#/p/${entry.projectId}` : "#/log";
      } catch (err) {
        el.disabled = false;
        toast(`Could not save: ${err.message}. The draft is still here.`);
      }
    },
  },
};

addEventListener("pagehide", persist);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") persist(); });
setInterval(persist, 3000);

async function rerender() { const { render } = await import("../app.js"); render(); }
