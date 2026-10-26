// Project page: the fuse, next smallest action, tasks by stage, BOM and budget, aims, risks, entries, exports, close.
import * as store from "../store.js";
import * as A from "../actions.js";
import { html, raw, rp, stamp, today, hours, copyText, download, searchLinks, safeUrl } from "../util.js";
import { icon, toast, modal, modalHead, ask } from "../ui.js";
import { STAGES, nextAction, projectCosts, projectTasks, proofByEntry, lineTotal } from "../derive.js";
import { offerProof } from "./home.js";
import { reportBrief, projectMarkdown, bomCsv, STYLES } from "../report.js";
import { projectToPlan } from "../../import/commit.js";

const idrIn = (n) => (n == null ? "" : new Intl.NumberFormat("id-ID").format(n));

export function fuse(p, { mini = false, readonly = false } = {}) {
  const i = Math.max(0, STAGES.indexOf(p.stage));
  return html`<div class="fuse${mini ? " mini" : ""}" style="--p:${i / 4}" role="group" aria-label="Stage: ${p.stage}">
    ${STAGES.map((s, k) => {
      const cls = `node${k <= i ? " lit" : ""}${k === i ? " cur" : ""}`;
      const inner = html`<i></i><span>${s}</span>${!mini && p.stageDates?.[s] ? html`<small>${p.stageDates[s].slice(5)}</small>` : ""}`;
      return readonly || mini ? html`<span class="${cls}">${inner}</span>` : html`<button class="${cls}" data-act="stage" data-stage="${s}" aria-pressed="${k === i}" aria-label="Move to ${s}">${inner}</button>`;
    })}</div>`;
}

const chipSkill = (s, lv, needsProof) => needsProof
  ? html`<span class="chip dash" title="Tagged skill, no proof yet">${s.name} · NEEDS PROOF</span>`
  : html`<span class="chip"><span class="lv">LV ${lv}</span>${s.name}</span>`;

function taskRow(t, ctx) {
  const skills = (t.skillIds || []).map((id) => store.get("skills", id)).filter(Boolean);
  const proved = t.entryId && ctx.proofs.get(t.entryId);
  // a skill needs proof until the task's entry has proof, or the skill already has proof in this project
  const needs = (s) => !proved && !(ctx.lv.get(s.id)?.projectIds || new Set()).has(t.projectId);
  return html`<div class="task${t.done ? " done" : ""}">
    <button class="tick" data-act="tick" data-id="${t.id}" aria-label="${t.done ? "Mark not done" : "Mark done"}: ${t.title}" aria-pressed="${!!t.done}"><i></i></button>
    <input class="bare" data-edit="tasks.${t.id}.title" value="${t.title}" aria-label="Task title">
    <span class="tools">
      <button class="btn s icon ghost" data-act="task-move" data-id="${t.id}" data-dir="-1" aria-label="Move up">${icon("up")}</button>
      <button class="btn s icon ghost" data-act="task-move" data-id="${t.id}" data-dir="1" aria-label="Move down">${icon("down")}</button>
      <button class="btn s icon ghost" data-act="task-archive" data-id="${t.id}" aria-label="Archive task">${icon("trash")}</button>
    </span>
    ${(t.estMinutes || (t.proofKinds || []).length || skills.length || t.entryId) ? html`<div class="meta">
      ${t.estMinutes ? html`<span class="chip mono">${t.estMinutes} min</span>` : ""}
      ${(t.proofKinds || []).map((k) => html`<span class="chip dash">${k}</span>`)}
      ${skills.map((s) => chipSkill(s, ctx.lv.get(s.id)?.level || 0, needs(s)))}
      ${t.entryId ? html`<a class="chip" href="#/entry/${t.entryId}">${proved ? "Proof logged" : "Entry, no proof"}</a>` : ""}
    </div>` : ""}
    <details><summary>Details</summary><div class="stack s">
      <div class="row only-s"><button class="btn s" data-act="task-move" data-id="${t.id}" data-dir="-1">${icon("up")}Move up</button><button class="btn s" data-act="task-move" data-id="${t.id}" data-dir="1">${icon("down")}Move down</button></div>
      <textarea class="in" data-edit="tasks.${t.id}.detail" placeholder="Detail" aria-label="Detail">${t.detail || ""}</textarea>
      <div class="row">
        <label class="f" style="width:9em"><span>Minutes</span><input class="in" data-edit="tasks.${t.id}.estMinutes" data-type="int" inputmode="numeric" value="${t.estMinutes ?? ""}"></label>
        <label class="f" style="width:11em"><span>Stage</span><select class="in" data-edit="tasks.${t.id}.stage">${STAGES.map((s) => html`<option ${s === t.stage ? raw("selected") : ""}>${s}</option>`)}</select></label>
      </div>
      <p class="label">Proof to capture</p>
      <div class="row">${["photo", "measurement", "snippet", "note"].map((k) => html`<button class="chip ${(t.proofKinds || []).includes(k) ? "on" : ""}" data-act="task-proof" data-id="${t.id}" data-k="${k}">${k}</button>`)}</div>
      <p class="label">Skills it should prove</p>
      <div class="row">${store.all("skills").map((s) => html`<button class="chip ${(t.skillIds || []).includes(s.id) ? "on" : ""}" data-act="task-skill" data-id="${t.id}" data-skill="${s.id}">${s.name}</button>`)}</div>
      ${(t.dependsOn || []).length ? html`<p class="muted">After: ${(t.dependsOn || []).map((id) => store.get("tasks", id)?.title).filter(Boolean).join(", ")}</p>` : ""}
    </div></details>
  </div>`;
}

export default {
  title: (ctx) => store.get("projects", ctx.id)?.name || "Project",
  render(ctx) {
    const p = store.get("projects", ctx.id);
    if (!p) return html`<div class="empty">This project is not here. It may be archived.<a class="btn" href="#/archive">Open the archive</a></div>`;
    const d = A.data();
    const track = store.get("tracks", p.trackId);
    const na = nextAction(d, p);
    const tasks = projectTasks(d, p.id);
    const costs = projectCosts(d, p.id, p);
    const lines = store.all("bomLines").filter((l) => l.projectId === p.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const entries = store.all("entries").filter((e) => e.projectId === p.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const tctx = { lv: A.levels(), proofs: proofByEntry(d.evidence) };
    const capPct = costs.cap ? Math.min(100, (costs.planned / costs.cap) * 100) : 0;
    const resources = store.all("resources").filter((r) => r.projectId === p.id);
    const done = tasks.filter((t) => t.done).length;
    const parts = store.all("parts");

    return html`
    <div class="page-h">
      <div class="stack s" style="flex:1;min-width:260px">
        <p class="label">${track?.name || "Robotics"} · project${p.closedAt ? ` · closed ${p.closedAt.slice(0, 10)}` : ""}${p.importBatchId ? " · imported plan" : ""}</p>
        <input class="bare" data-edit="projects.${p.id}.name" value="${p.name}" aria-label="Project name" style="font:700 clamp(26px,3.6vw,40px)/1.1 var(--font-sans);letter-spacing:-.03em">
        <textarea class="bare" data-edit="projects.${p.id}.summary" placeholder="One line on what it does" aria-label="Summary" rows="1" style="min-height:40px;color:var(--ink-muted)">${p.summary || ""}</textarea>
      </div>
      <div class="row">
        <a class="btn hot" href="#/entry/new?project=${p.id}">${icon("plus")}Log entry</a>
        <button class="btn" data-act="brief">${icon("file")}Report brief</button>
        <button class="btn" data-act="more">More</button>
      </div>
    </div>

    <section class="panel" style="margin-bottom:20px">${fuse(p)}</section>

    <div class="grid2">
      <div class="stack l">
        <section class="next-card">
          <p class="label">Next smallest action</p>
          <p class="t">${na.text || "Add a task below."}</p>
          <div class="row">
            ${na.taskId ? html`<button class="btn primary" data-act="tick" data-id="${na.taskId}">${icon("check")}Mark done</button>` : ""}
            <a class="btn" href="#/entry/new?project=${p.id}${na.taskId ? `&task=${na.taskId}` : ""}">${icon("camera")}Log proof</a>
            <button class="btn" data-act="edit-next">Write my own</button>
            ${na.source === "override" ? html`<button class="btn ghost" data-act="clear-next" style="color:#0D0E10">Use the task list</button>` : ""}
          </div>
        </section>

        <section class="panel">
          <div class="panel-h"><h3>Tasks</h3><span class="mono muted">${done}/${tasks.length} done</span></div>
          ${STAGES.map((s) => {
            const list = tasks.filter((t) => t.stage === s);
            return html`<div class="stage-block${s === p.stage ? " cur" : ""}"><p class="label">${s} <span class="mono">${list.filter((t) => t.done).length}/${list.length}</span></p>
              ${list.map((t) => taskRow(t, tctx))}
              <form class="row" data-add-task="${s}" style="margin-top:4px"><input class="bare" name="t" placeholder="Add a task" aria-label="Add a task to ${s}"></form></div>`;
          })}
        </section>

        <section class="panel">
          <div class="panel-h"><h3>Diary</h3><a class="btn s" href="#/entry/new?project=${p.id}">Log entry</a></div>
          ${entries.length ? html`<div class="stack s">${entries.slice(0, 12).map((e) => html`<a href="#/entry/${e.id}" class="row" style="text-decoration:none;min-height:40px"><span class="mono subtle">${stamp(e.createdAt)}</span><span class="mono ty-${e.type}" style="font-weight:700;text-transform:uppercase;font-size:12px">${e.type}</span><span>${e.title || "(untitled)"}</span>${tctx.proofs.get(e.id) ? html`<span class="chip">${tctx.proofs.get(e.id)} proof</span>` : ""}</a>`)}</div>` : html`<p class="muted">No entries yet.</p>`}
        </section>
      </div>

      <div class="stack l">
        <section class="panel stack">
          <div class="panel-h"><h3>Budget</h3>${costs.overCap ? html`<span class="st bad">Over the cap</span>` : costs.cap ? html`<span class="st ok">Within the cap</span>` : ""}</div>
          <div class="money">
            <div><p class="label">Planned</p><p class="v">${rp(costs.planned)}</p></div>
            <div><p class="label">Cap</p><input class="bare num" data-edit="projects.${p.id}.budgetCapIdr" data-type="idr" inputmode="numeric" value="${idrIn(p.budgetCapIdr)}" placeholder="Set a cap" aria-label="Budget cap in rupiah" style="font:300 24px/1.1 var(--font-sans)"></div>
            <div><p class="label">Actual</p><p class="v">${rp(costs.actual)}</p></div>
            <div><p class="label">Variance</p><p class="v">${costs.variance > 0 ? "+" : ""}${rp(costs.variance)}</p></div>
          </div>
          ${costs.cap ? html`<div class="meter${costs.overCap ? " over" : ""}" role="img" aria-label="Planned is ${Math.round((costs.planned / costs.cap) * 100)} percent of the cap"><i style="width:${capPct}%"></i></div>` : ""}
          <p class="muted">Cost per skill proven here: <b class="mono">${costs.costPerSkill == null ? "no proof yet" : rp(costs.costPerSkill)}</b>${costs.provenSkills ? ` across ${costs.provenSkills} skill${costs.provenSkills === 1 ? "" : "s"}` : ""}.${costs.unpriced ? ` ${costs.unpriced} line${costs.unpriced === 1 ? " is" : "s are"} unpriced.` : ""}</p>
        </section>

        <section class="panel">
          <div class="panel-h"><h3>Bill of materials</h3><button class="btn s" data-act="csv">${icon("download")}CSV</button></div>
          <div class="scroll-x"><table class="t bom">
            <thead><tr><th>Part</th><th class="r">Qty</th><th class="r">Unit, Rp</th><th class="r">Line</th><th></th></tr></thead>
            <tbody>${lines.map((l) => {
              const part = store.get("parts", l.partId);
              return html`<tr>
                <td><a href="#/parts?open=${l.partId}" style="font-weight:500">${part?.name || l.name}</a>
                  <div class="row" style="gap:6px">${l.fromInventory ? html`<span class="from-inv">From inventory</span>` : html`<span class="st ${part && A.OWNED.has(part.status) ? "ok" : part?.status === "ordered" ? "warn" : ""}" style="font-size:11px">${A.statusLabel(part?.status || "planned")}</span>`}
                  ${!l.fromInventory && !(part?.links || []).length ? searchLinks(part?.searchQuery || part?.name || l.name).map((x) => html`<a class="tag" href="${x.url}" target="_blank" rel="noopener noreferrer">${x.shop} search</a>`) : ""}
                  ${(part?.links || []).map((x) => safeUrl(x.url) ? html`<a class="tag" href="${safeUrl(x.url)}" target="_blank" rel="noopener noreferrer">${x.shop}</a>` : "")}</div></td>
                <td class="r"><input class="bare num-in" style="width:4em" data-edit="bomLines.${l.id}.qty" data-type="int" min="1" inputmode="numeric" value="${l.qty}" aria-label="Quantity"></td>
                <td class="r">${l.fromInventory ? html`<span class="mono">0</span>` : html`<input class="bare num-in" data-edit="bomLines.${l.id}.plannedPriceIdr" data-type="idr" inputmode="numeric" value="${idrIn(l.plannedPriceIdr)}" placeholder="unpriced" aria-label="Planned unit price">`}</td>
                <td class="r mono">${l.fromInventory ? "Rp 0" : l.plannedPriceIdr == null ? "—" : rp(lineTotal(l))}</td>
                <td class="r" style="white-space:nowrap">${!l.fromInventory && !(part && A.OWNED.has(part.status)) && part?.status !== "ordered" ? html`<button class="btn s" data-act="buy" data-line="${l.id}">Bought</button>` : ""}<button class="btn s icon ghost" data-act="line-archive" data-id="${l.id}" aria-label="Remove line">${icon("trash")}</button></td></tr>`;
            })}</tbody></table></div>
          <form class="row" data-add-line style="margin-top:8px"><input class="in" name="n" list="parts-dl" placeholder="Add a part. Owned parts cost Rp 0" aria-label="Add a BOM line" style="flex:1"><button class="btn s">Add</button></form>
          <datalist id="parts-dl">${parts.filter((x) => x.status !== "retired").map((x) => html`<option value="${x.name}">${A.statusLabel(x.status)}</option>`)}</datalist>
        </section>

        <section class="panel stack">
          <div class="panel-h"><h3>Aims</h3>${p.closedAt ? "" : html`<button class="btn s" data-act="close">Close project</button>`}</div>
          ${(p.aims || []).map((a, i) => html`<div class="row" style="flex-wrap:nowrap">
            ${a.met === true ? html`<span class="st ok">Met</span>` : a.met === false ? html`<span class="st bad">Not met</span>` : ""}
            <input class="bare" data-k="aim-${i}" data-aim="${i}" value="${a.text}" aria-label="Aim ${i + 1}">
            <button class="btn s icon ghost" data-act="aim-del" data-i="${i}" aria-label="Remove aim">${icon("trash")}</button></div>
            ${a.reflection ? html`<p class="muted" style="padding-left:8px">${a.reflection}</p>` : ""}`)}
          <form data-add-aim><input class="bare" name="a" placeholder="Add an aim you can check, like: stop 20 cm before a wall" aria-label="Add an aim"></form>
        </section>

        ${(p.risks || []).length || resources.length ? html`<section class="panel stack">
          ${(p.risks || []).length ? html`<h3>Risks</h3>${p.risks.map((r) => html`<div><span class="st warn">${r.text}</span>${r.mitigation ? html`<p class="muted" style="padding-left:14px">${r.mitigation}</p>` : ""}</div>`)}` : ""}
          ${resources.length ? html`<h3>Resources</h3>${resources.map((r) => html`<p><span class="chip">${r.type}</span> ${safeUrl(r.url) ? html`<a href="${safeUrl(r.url)}" target="_blank" rel="noopener noreferrer">${r.title}</a>` : r.title}${r.note ? html` <span class="muted">· ${r.note}</span>` : ""}</p>`)}` : ""}
        </section>` : ""}
      </div>
    </div>`;
  },
  mount(root, ctx) {
    const p = store.get("projects", ctx.id);
    if (!p) return;
    root.querySelectorAll("[data-add-task]").forEach((f) => f.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = f.t.value.trim();
      if (v) { A.addTask(p.id, f.dataset.addTask, v); f.t.value = ""; }
    }));
    root.querySelector("[data-add-line]")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = e.target.n.value.trim();
      if (v) { const { result } = A.addBomLine(p.id, v); toast(result.fromInventory ? `${v} is from your inventory: Rp 0.` : `${v} added to the plan.`, { ms: 4000 }); }
    });
    root.querySelector("[data-add-aim]")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = e.target.a.value.trim();
      if (v) store.update("projects", p.id, { aims: [...(p.aims || []), { text: v, met: null, reflection: "" }] });
    });
    root.querySelectorAll("[data-aim]").forEach((inp) => inp.addEventListener("change", () => {
      const aims = [...(store.get("projects", p.id).aims || [])];
      aims[+inp.dataset.aim] = { ...aims[+inp.dataset.aim], text: inp.value.trim() };
      store.update("projects", p.id, { aims });
    }));
  },
  acts: {
    stage: (el) => A.setStage(currentId(), el.dataset.stage),
    tick: (el) => offerProof(el.dataset.id, A.toggleTask(el.dataset.id)),
    "task-move": (el) => A.moveTask(el.dataset.id, +el.dataset.dir),
    "task-archive": (el) => A.archiveWithUndo("tasks", el.dataset.id, "Task"),
    "task-proof": (el) => toggleIn("tasks", el.dataset.id, "proofKinds", el.dataset.k),
    "task-skill": (el) => toggleIn("tasks", el.dataset.id, "skillIds", el.dataset.skill),
    "line-archive": (el) => A.archiveWithUndo("bomLines", el.dataset.id, "BOM line"),
    "aim-del": (el) => { const p = store.get("projects", currentId()); const aims = [...p.aims]; aims.splice(+el.dataset.i, 1); const { undo } = store.undoable(() => store.update("projects", p.id, { aims })); toast("Aim removed.", { undo }); },
    "edit-next": async () => {
      const p = store.get("projects", currentId());
      const v = await ask("Next smallest action", [{ name: "t", label: "One small step you can do next", value: p.nextAction || nextAction(A.data(), p).text }]);
      if (v) store.update("projects", p.id, { nextAction: v.t.trim() });
    },
    "clear-next": () => store.update("projects", currentId(), { nextAction: "" }),
    buy: (el) => buyDialog(store.get("bomLines", el.dataset.line)),
    csv: () => { const p = store.get("projects", currentId()); download(`${slug(p.name)}-bom.csv`, bomCsv(A.data(), p.id), "text/csv"); },
    brief: () => briefDialog(currentId()),
    more: () => moreDialog(currentId()),
    close: () => closeDialog(currentId()),
  },
};

const currentId = () => location.hash.split("/")[2]?.split("?")[0];
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";

function toggleIn(col, id, field, v) {
  const cur = store.get(col, id)?.[field] || [];
  store.update(col, id, { [field]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] });
}

export async function buyDialog(line, part = line && store.get("parts", line.partId)) {
  part ||= line && store.get("parts", line.partId);
  if (!part) return;
  const shops = [...new Set([...(part.links || []).map((l) => l.shop), "Shopee", "Tokopedia"])];
  const v = await ask(`Bought ${part.name}`, [
    { name: "priceIdr", label: "Unit price paid, Rp", inputmode: "numeric", value: line?.plannedPriceIdr ? idrIn(line.plannedPriceIdr) : part.lastPaidIdr ? idrIn(part.lastPaidIdr) : "", placeholder: "85.000" },
    { name: "qty", label: "Quantity", inputmode: "numeric", value: String(line?.qty || part.qty || 1) },
    { name: "shop", label: "Shop", type: "select", value: shops[0], options: shops.map((s) => ({ value: s, label: s })) },
    { name: "date", label: "Date", type: "date", value: today() },
  ], { submit: "Save purchase", note: "This is the only place a price is saved. It also logs a purchase entry." });
  if (!v) return;
  const { parseIdr } = await import("../util.js");
  const { undo } = A.recordPurchase({ partId: part.id, projectId: line?.projectId || part.projectId, priceIdr: parseIdr(v.priceIdr) ?? 0, qty: parseInt(v.qty, 10) || 1, shop: v.shop, date: v.date || today() });
  toast(`Purchase saved: ${part.name}.`, { undo });
}

function briefDialog(projectId) {
  let style = "portfolio";
  const draw = () => reportBrief(A.data(), projectId, style);
  modal(String(html`${modalHead("Report brief")}
    <p class="muted">Copy this into any AI. It writes the report; Fuse never calls an AI itself.</p>
    <div class="seg" role="group" aria-label="Report style" style="margin:12px 0">${Object.entries(STYLES).map(([k, s]) => html`<button data-style="${k}" aria-pressed="${k === style}">${s.label}</button>`)}</div>
    <pre class="snip" style="max-height:46vh;white-space:pre-wrap" id="brief-pre" tabindex="0">${draw()}</pre>
    <div class="row end" style="margin-top:12px"><button class="btn hot" data-copy>${icon("copy")}Copy brief</button></div>`), {
    wide: true, label: "Report brief",
    onMount: (root) => {
      root.addEventListener("click", async (e) => {
        const b = e.target.closest("[data-style]");
        if (b) { style = b.dataset.style; root.querySelectorAll("[data-style]").forEach((x) => x.setAttribute("aria-pressed", x === b)); root.querySelector("#brief-pre").textContent = draw(); }
        if (e.target.closest("[data-copy]")) { await copyText(draw()); toast("Brief copied. Paste it into your AI.", { ms: 4000 }); }
      });
    },
  });
}

function moreDialog(projectId) {
  const p = store.get("projects", projectId);
  modal(String(html`${modalHead(p.name)}<div class="stack">
    <button class="btn" data-x="plan">${icon("copy")}Copy plan for AI</button>
    <button class="btn" data-x="md">${icon("download")}Export Markdown</button>
    <button class="btn" data-x="csv">${icon("download")}Export BOM as CSV</button>
    <label class="f"><span>Track</span><select class="in" data-x-track>${store.all("tracks").map((t) => html`<option value="${t.id}" ${t.id === p.trackId ? raw("selected") : ""}>${t.name}</option>`)}</select></label>
    ${p.closedAt ? html`<button class="btn" data-x="reopen">Reopen project</button>` : html`<button class="btn" data-x="close">Close project</button>`}
    <button class="btn danger" data-x="archive">${icon("archive")}Archive project</button>
  </div>`), {
    label: "Project actions",
    onMount: (root, close) => {
      root.querySelector("[data-x-track]").addEventListener("change", (e) => store.update("projects", p.id, { trackId: e.target.value }));
      root.addEventListener("click", async (e) => {
        const x = e.target.closest("[data-x]")?.dataset.x;
        if (!x) return;
        const d = A.data();
        if (x === "plan") { await copyText(JSON.stringify(projectToPlan(d, p.id), null, 2)); toast("Plan copied in fuse.project/1. Ask your AI for changes, then import the reply.", { ms: 5000 }); }
        if (x === "md") download(`${slug(p.name)}.md`, projectMarkdown(d, p.id), "text/markdown");
        if (x === "csv") download(`${slug(p.name)}-bom.csv`, bomCsv(d, p.id), "text/csv");
        if (x === "reopen") { const { undo } = store.undoable(() => store.update("projects", p.id, { closedAt: null })); toast("Project reopened.", { undo }); }
        if (x === "close") { close(); closeDialog(p.id); return; }
        if (x === "archive") { close(); A.archiveWithUndo("projects", p.id, p.name); location.hash = "#/projects"; return; }
        if (x !== "plan") close();
      });
    },
  });
}

function closeDialog(projectId) {
  const p = store.get("projects", projectId);
  const aims = (p.aims || []).map((a) => ({ ...a }));
  modal(String(html`${modalHead(`Close ${p.name}`)}
    <form class="stack" data-close-f>
      ${aims.length ? aims.map((a, i) => html`<fieldset class="panel stack s" style="border-radius:12px"><legend class="sr">Aim ${i + 1}</legend>
        <p style="font-weight:700">${a.text}</p>
        <div class="row"><label class="check"><input type="radio" name="met${i}" value="yes" ${a.met === true ? raw("checked") : ""}>Met</label><label class="check"><input type="radio" name="met${i}" value="no" ${a.met === false ? raw("checked") : ""}>Not met</label></div>
        <textarea class="in" name="ref${i}" placeholder="What did this aim teach you?">${a.reflection || ""}</textarea></fieldset>`) : html`<p class="muted">This project has no aims. Add a reflection entry after closing.</p>`}
      <div class="row end"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn hot">Close project</button></div>
    </form>`), {
    label: "Close project",
    onMount: (root, close) => root.querySelector("[data-close-f]").addEventListener("submit", (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const next = aims.map((a, i) => ({ ...a, met: f.get(`met${i}`) === "yes" ? true : f.get(`met${i}`) === "no" ? false : null, reflection: String(f.get(`ref${i}`) || "").trim() }));
      store.update("projects", p.id, { aims: next, closedAt: new Date().toISOString(), stage: "document", stageDates: { ...(p.stageDates || {}), document: p.stageDates?.document || today() } });
      close();
      completion(p.id);
    }),
  });
}

export function completion(projectId) {
  const d = A.data();
  const p = store.get("projects", projectId);
  const secs = store.all("entries").filter((e) => e.projectId === p.id).reduce((n, e) => n + (e.sessionSec || 0), 0);
  const costs = projectCosts(d, p.id, p);
  const met = (p.aims || []).filter((a) => a.met).length;
  const el = document.createElement("div");
  el.className = "completion";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Project complete");
  el.innerHTML = String(html`<p class="label" style="color:#C9C8D6">${p.name} · closed ${today()}</p>
    <h1>It works. <b class="grad-text">It is proven.</b></h1>
    <div class="nums">
      <div><b>${hours(secs)}<small>h</small></b><span>Logged</span></div>
      <div><b>${Math.round(costs.actual / 1000)}<small>k Rp</small></b><span>Spent</span></div>
      <div><b>${costs.provenSkills}</b><span>Skills with proof</span></div>
      ${(p.aims || []).length ? html`<div><b>${met}<small>/${p.aims.length}</small></b><span>Aims met</span></div>` : ""}
    </div>
    <p style="max-width:52ch;color:#E4E3EE">Export a backup now so this project has three copies, then turn it into a report.</p>
    <div class="acts" style="margin-top:24px"><button class="btn" data-c="backup">${icon("download")}Export backup</button><button class="btn" data-c="brief">${icon("file")}Report brief</button><button class="btn" data-c="x">Done</button></div>`);
  el.addEventListener("click", (e) => {
    const c = e.target.closest("[data-c]")?.dataset.c;
    if (c === "backup") A.exportBackup().catch((err) => toast(`Export failed: ${err.message}`));
    if (c === "brief") { el.remove(); briefDialog(p.id); }
    if (c === "x") el.remove();
  });
  document.body.append(el);
  el.querySelector("button").focus();
}
