// Project Notebook: sections are views over entries and files. Files upload straight to R2.
// Soft delete only (deletedAt), behind the delete passcode. A completed project is locked: no delete, no replace.
import * as store from "../store.js";
import * as A from "../actions.js";
import { html, raw, dateOf } from "../util.js";
import { icon, toast, modal, modalHead, ask } from "../ui.js";
import { SECTIONS, sectionOf } from "../derive.js";
import { uploadFile, retry, cancel, openFile, live, fmtSize, ACCEPT } from "../files.js";

const label = (id) => SECTIONS.find((s) => s[0] === id)?.[1] || id;
const filesOf = (p) => store.all("files").filter((f) => f.projectId === p.id && !f.deletedAt);

export function notebook(p) {
  const entries = store.all("entries").filter((e) => e.projectId === p.id && !e.parked);
  const files = filesOf(p);
  const count = (id) => entries.filter((e) => sectionOf(e) === id).length + files.filter((f) => f.section === id).length + (id === "problem" && p.problem?.statement ? 1 : 0);
  const locked = p.status === "complete";
  return html`<details class="panel notebook" data-nb>
    <summary class="spread"><h3>Notebook</h3><span class="muted">${entries.length} entries · ${files.length} files${locked ? " · locked" : ""}</span></summary>
    <div class="stack" style="margin-top:16px">
      <div class="nb-list">${SECTIONS.map(([id, l]) => html`<button class="nb-row" data-act="nb-open" data-s="${id}"><span>${l}</span><span class="mono muted">${count(id)}</span></button>`)}</div>
      <form class="stack s nb-upload" data-upload>
        <p class="label">Add a file</p>
        <input type="file" name="f" accept="${ACCEPT}" aria-label="File to upload" required>
        <div class="row"><label class="f" style="flex:1"><span>Section</span><select class="in" name="section">${SECTIONS.map(([id, l]) => html`<option value="${id}" ${id === "models-drawings" ? raw("selected") : ""}>${l}</option>`)}</select></label>
          <label class="f" style="flex:2"><span>Caption</span><input class="in" name="caption" placeholder="Bracket v3, printed in PLA"></label></div>
        <div class="row end"><button class="btn primary">${icon("upload")}Upload</button></div>
        <p class="muted">Models, drawings, PDFs and images up to 200 MB. They go to private storage; Fuse keeps the name, size and caption.</p>
      </form>
      ${files.length ? html`<div class="file-grid">${files.map((f) => fileCard(f, locked))}</div>` : html`<p class="muted">No files yet.</p>`}
    </div>
  </details>`;
}

export function fileCard(f, locked) {
  const u = live.get(f.id);
  const thumb = f.kind === "image" ? "IMG" : f.kind === "model" ? "3D" : f.kind === "doc" ? "DOC" : "FILE";
  return html`<div class="file-card">
    <span class="th" aria-hidden="true">${thumb}</span>
    <div class="stack s" style="min-width:0">
      <p class="nm">${f.name}</p>
      <p class="muted">${fmtSize(f.size)} · ${label(f.section)}${f.caption ? ` · ${f.caption}` : ""}</p>
      ${f.status === "pending" && u ? html`<div class="meter-n" role="progressbar" aria-valuenow="${u.pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Uploading ${f.name}"><i style="width:${u.pct}%"></i></div><span class="mono">${u.pct} percent</span>` : ""}
      ${f.status === "failed" ? html`<span class="st bad">Upload failed${u?.error ? `: ${u.error}` : ""}</span>` : ""}
      ${f.status === "pending" && !u ? html`<span class="st warn">Waiting to upload</span>` : ""}
      <div class="row">
        ${f.status === "ready" ? html`<button class="btn s" data-act="file-open" data-id="${f.id}">Open</button><button class="btn s" data-act="file-dl" data-id="${f.id}">${icon("download")}Download</button>` : ""}
        ${f.status === "pending" && u ? html`<button class="btn s" data-act="file-cancel" data-id="${f.id}">Cancel</button>` : ""}
        ${f.status === "failed" || (f.status === "pending" && !u) ? html`<button class="btn s" data-act="file-retry" data-id="${f.id}">Retry</button>` : ""}
        ${locked ? html`<span class="muted">${icon("lock")}Locked</span>` : html`<button class="btn s ghost" data-act="file-del" data-id="${f.id}">Delete</button>`}
      </div>
    </div></div>`;
}

export function mountNotebook(root, p) {
  root.querySelector("[data-upload]")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target.f.files[0];
    if (!f) return;
    const section = e.target.section.value, caption = e.target.caption.value.trim();
    e.target.reset();
    try { await uploadFile(f, { projectId: p.id, section, caption }); toast(`${f.name} uploaded.`, { ms: 4000 }); }
    catch (err) { toast(err.message); }
  });
  const nb = root.querySelector("[data-nb]");
  if (nb) { nb.open = !!openNb[p.id]; nb.addEventListener("toggle", () => { openNb[p.id] = nb.open; }); }
}
const openNb = {};

// Ask for the delete passcode; offers to set one when none exists. Resolves true when it matches.
export async function askPasscode(why) {
  const rec = store.get("meta", "security");
  if (!rec?.hash) {
    const v = await ask("Set a delete passcode", [{ name: "a", label: "New passcode", type: "password" }, { name: "b", label: "Type it again", type: "password" }],
      { submit: "Set passcode", note: "Fuse asks for this before anything is deleted. It stops accidents, not attackers." });
    if (!v) return false;
    if (!v.a || v.a !== v.b) { toast("The two passcodes do not match."); return false; }
    await A.setPasscode(v.a);
    toast("Passcode set.", { ms: 3000 });
  }
  const v = await ask(why, [{ name: "c", label: "Delete passcode", type: "password" }], { submit: "Confirm" });
  if (!v) return false;
  const ok = await A.checkPasscode(v.c);
  if (!ok) toast("That passcode is not right.");
  return ok;
}

export const nbActs = {
  "nb-open": (el) => openSection(el.dataset.s),
  "file-open": (el) => openFile(el.dataset.id).catch((e) => toast(e.message)),
  "file-dl": (el) => openFile(el.dataset.id, { download: true }).catch((e) => toast(e.message)),
  "file-cancel": (el) => cancel(el.dataset.id),
  "file-retry": (el) => retryPick(el.dataset.id),
  "file-del": async (el) => {
    const f = store.get("files", el.dataset.id);
    const p = store.get("projects", f?.projectId);
    if (!f) return;
    if (p?.status === "complete") { toast("This project is complete and locked."); return; }
    if (!(await askPasscode(`Delete ${f.name}`))) return;
    const { undo } = store.undoable(() => store.update("files", f.id, { deletedAt: new Date().toISOString() }));
    toast(`${f.name} moved to the Archive. The bytes stay in storage.`, { undo });
  },
};

async function retryPick(id) {
  try { await retry(id); }
  catch {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = ACCEPT;
    inp.onchange = () => inp.files[0] && retry(id, inp.files[0]).catch((e) => toast(e.message));
    inp.click();
  }
}

function openSection(id) {
  const pid = location.hash.split("/")[2]?.split("?")[0];
  const p = store.get("projects", pid);
  const entries = store.all("entries").filter((e) => e.projectId === pid && !e.parked && sectionOf(e) === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const files = filesOf(p).filter((f) => f.section === id);
  const close = modal(String(html`${modalHead(label(id))}<div class="stack">
    ${id === "problem" && p.problem?.statement ? html`<div class="panel stack s"><p>${p.problem.statement}</p><p class="muted">For: ${p.problem.forWhom || "not set"} · Success: ${p.problem.successMeasure?.text || "not set"}</p></div>` : ""}
    ${entries.map((e) => html`<a class="nb-row" href="#/entry/${e.id}" data-close><span>${e.title || "(untitled)"}</span><span class="mono muted">${dateOf(e.createdAt)}</span></a>`)}
    ${files.length ? html`<div class="file-grid">${files.map((f) => fileCard(f, p.status === "complete"))}</div>` : ""}
    ${entries.length + files.length || (id === "problem" && p.problem?.statement) ? "" : html`<p class="muted">Nothing here yet.</p>`}
  </div>`), { wide: true, label: label(id), onMount: (root) => root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (b && nbActs[b.dataset.act]) { e.stopPropagation(); close(); nbActs[b.dataset.act](b); }
  }) });
}
