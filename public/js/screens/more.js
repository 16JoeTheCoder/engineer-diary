// Library (resources), Archive (restore anything), Settings (sync, backup, storage, theme, tracks, sample data).
import * as store from "../store.js";
import * as A from "../actions.js";
import * as db from "../db.js";
import { html, raw, dateOf, safeUrl, stamp } from "../util.js";
import { icon, toast } from "../ui.js";
import { loadSample, removeSample, hasSample } from "../sample.js";
import { checkBackup } from "../backup.js";
import { stuck, retry, fmtSize } from "../files.js";

const RTYPES = ["video", "course", "datasheet", "article", "tool"];

export const library = {
  title: "Library",
  render(ctx) {
    const { type = "", skill = "" } = ctx.query;
    const skills = store.all("skills");
    const all = store.all("resources").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const list = all.filter((r) => (!type || r.type === type) && (!skill || (r.skillIds || []).includes(skill)));
    const entries = store.all("entries");
    const q = (o) => "#/library?" + new URLSearchParams(Object.entries({ type, skill, ...o }).filter(([, v]) => v)).toString();
    const usedIn = (r) => {
      const n = entries.filter((e) => (e.resourceIds || []).includes(r.id)).length;
      const pn = store.get("projects", r.projectId)?.name;
      return [pn, n ? `${n} entr${n === 1 ? "y" : "ies"}` : ""].filter(Boolean).join(" · ") || "Not used yet";
    };
    return html`
      <div class="page-h"><h1>Library</h1></div>
      <details class="disclosure" ${all.length ? "" : raw("open")}><summary class="btn">${icon("plus")}Add a resource</summary>
      <form class="panel stack" data-add-res style="margin-top:12px">
        <label class="f"><span>Title</span><input class="in" name="title" placeholder="TB6612FNG datasheet" required></label>
        <label class="f"><span>Link (optional)</span><input class="in" name="url" type="url" inputmode="url" placeholder="https://"></label>
        <div class="row"><label class="f" style="width:auto"><span>Type</span><select class="in" name="type">${RTYPES.map((t) => html`<option>${t}</option>`)}</select></label>
          <label class="f" style="flex:1"><span>Note</span><input class="in" name="note" placeholder="What to read first"></label></div>
        <div class="row end"><button class="btn primary">Add resource</button></div>
      </form></details>
      ${all.length ? html`<div class="filters" role="group" aria-label="Filter resources">
        <div class="row"><a class="chip ${!type ? "on" : ""}" href="${q({ type: "" })}">All types</a>${RTYPES.map((t) => html`<a class="chip ${t === type ? "on" : ""}" href="${q({ type: t === type ? "" : t })}">${t}</a>`)}</div>
        ${skills.length ? html`<div class="row"><a class="chip ${!skill ? "on" : ""}" href="${q({ skill: "" })}">All skills</a>${skills.map((s) => html`<a class="chip ${s.id === skill ? "on" : ""}" href="${q({ skill: s.id === skill ? "" : s.id })}">${s.name}</a>`)}</div>` : ""}
      </div>` : ""}
      <div class="list" style="margin-top:24px">${list.map((r) => html`<div class="res-row">
        <div class="stack s" style="min-width:0">
          <p class="res-t">${safeUrl(r.url) ? html`<a href="${safeUrl(r.url)}" target="_blank" rel="noopener noreferrer">${r.title}${icon("external")}</a>` : r.title}</p>
          <p class="muted">${r.type}${(r.skillIds || []).length ? ` · ${(r.skillIds || []).map((id) => store.get("skills", id)?.name).filter(Boolean).join(", ")}` : ""}</p>
          <p class="subtle">${usedIn(r)}${r.note ? ` · ${r.note}` : ""}</p>
        </div>
        <span class="row" style="flex-wrap:nowrap"><button class="btn s" data-act="res-edit" data-id="${r.id}">Edit</button><button class="btn s icon ghost" data-act="res-archive" data-id="${r.id}" aria-label="Archive ${r.title}">${icon("archive")}</button></span>
      </div>`)}
      ${all.length && !list.length ? html`<div class="empty">No resources match these filters.<a class="btn s" href="#/library">Clear filters</a></div>` : ""}
      ${all.length ? "" : html`<div class="empty">No resources yet. Add a datasheet, article or video you learned from.</div>`}</div>`;
  },
  mount(root) {
    root.querySelector("[data-add-res]")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(e.target));
      store.add("resources", { title: v.title.trim(), url: safeUrl(v.url) || "", type: v.type, note: v.note.trim(), projectId: A.activeProject()?.id || null, skillIds: [] });
      e.target.reset();
      toast("Resource added.", { ms: 3000 });
    });
  },
  acts: {
    "res-archive": (el) => A.archiveWithUndo("resources", el.dataset.id, "Resource"),
    "res-edit": (el) => editResource(el.dataset.id),
    "res-skill": (el) => { const r = store.get("resources", el.dataset.id); const s = el.dataset.s; const ids = r.skillIds || []; store.update("resources", r.id, { skillIds: ids.includes(s) ? ids.filter((x) => x !== s) : [...ids, s] }); },
  },
};

async function editResource(id) {
  const { modal, modalHead } = await import("../ui.js");
  const draw = () => {
    const r = store.get("resources", id);
    if (!r) return html`${modalHead("Resource")}<p class="muted">Not found.</p>`;
    return html`${modalHead("Edit resource")}<div class="stack">
      <label class="f"><span>Title</span><input class="in" data-edit="resources.${r.id}.title" value="${r.title}"></label>
      <label class="f"><span>Link</span><input class="in" data-edit="resources.${r.id}.url" value="${r.url || ""}" inputmode="url" placeholder="https://"></label>
      <label class="f"><span>Type</span><select class="in" data-edit="resources.${r.id}.type">${RTYPES.map((t) => html`<option ${t === r.type ? raw("selected") : ""}>${t}</option>`)}</select></label>
      <label class="f"><span>Note</span><input class="in" data-edit="resources.${r.id}.note" value="${r.note || ""}"></label>
      <p class="label">Skills it teaches (counts as level 1)</p>
      <div class="row">${store.all("skills").map((s) => html`<button class="chip ${(r.skillIds || []).includes(s.id) ? "on" : ""}" data-r-skill="${s.id}" aria-pressed="${(r.skillIds || []).includes(s.id)}">${s.name}</button>`)}</div>
      <div class="row end"><button class="btn primary" data-close>Done</button></div></div>`;
  };
  let root;
  const off = store.onChange(() => { if (root) root.innerHTML = String(draw()); });
  modal(String(draw()), { label: "Edit resource", onClose: off, onMount: (r) => {
    root = r;
    r.addEventListener("click", (e) => { const b = e.target.closest("[data-r-skill]"); if (!b) return; const res = store.get("resources", id); const s = b.dataset.rSkill; const ids = res.skillIds || []; store.update("resources", id, { skillIds: ids.includes(s) ? ids.filter((x) => x !== s) : [...ids, s] }); });
  } });
}

const LABELS = { projects: "Projects", parts: "Parts", entries: "Entries", tasks: "Tasks", skills: "Skills", domains: "Domains", bomLines: "BOM lines", evidence: "Evidence", resources: "Resources", purchases: "Purchases", tracks: "Tracks" };
const nameOf = (col, d) => d.name || d.title || d.caption || d.text?.slice(0, 40) || (col === "bomLines" ? `${d.name || "line"}` : col === "purchases" ? `${d.date} purchase` : d.kind || d.id);

export const archive = {
  title: "Archive",
  render() {
    const groups = Object.keys(LABELS).map((col) => [col, store.all(col, { archived: true }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))]).filter(([, l]) => l.length);
    const batches = store.all("importBatches").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const gone = store.all("files", { archived: "any" }).filter((f) => f.deletedAt || f.archived);
    return html`
      <div class="page-h"><h1>Archive</h1><p class="muted">Nothing is deleted. Restore anything.</p></div>
      ${gone.length ? html`<section class="panel" style="margin-bottom:16px"><div class="panel-h"><h3>Files</h3><span class="mono muted">${gone.length}</span></div>
        ${gone.map((f) => html`<div class="spread" style="border-bottom:1px solid var(--line);min-height:48px"><span>${f.name} <span class="mono subtle">${fmtSize(f.size)} · deleted ${dateOf(f.deletedAt || f.updatedAt)}</span></span><button class="btn s" data-act="file-restore" data-id="${f.id}">Restore</button></div>`)}</section>` : ""}
      ${groups.length ? groups.map(([col, list]) => html`<section class="panel" style="margin-bottom:16px"><div class="panel-h"><h3>${LABELS[col]}</h3><span class="mono muted">${list.length}</span></div>
        ${list.slice(0, 100).map((d) => html`<div class="spread" style="border-bottom:1px solid var(--line);min-height:48px"><span>${nameOf(col, d)} <span class="mono subtle" style="font-size:13px">archived ${dateOf(d.updatedAt)}</span></span><button class="btn s" data-act="restore" data-col="${col}" data-id="${d.id}">Restore</button></div>`)}</section>`)
        : gone.length ? "" : html`<div class="empty">The archive is empty. Anything you archive or delete lands here.</div>`}
      ${batches.length ? html`<section class="panel"><h3>Plan imports</h3><p class="muted">The original paste is kept untouched for each import.</p>
        ${batches.map((b) => html`<div class="spread" style="border-bottom:1px solid var(--line);min-height:52px"><span>${stamp(b.createdAt)} · ${store.get("projects", b.projectId)?.name || store.all("projects", { archived: true }).find((p) => p.id === b.projectId)?.name || "Project"} ${b.undone ? html`<span class="st warn">Undone</span>` : ""}</span>
          <span class="row"><button class="btn s" data-act="raw" data-id="${b.id}">View original</button>${b.undone ? "" : html`<button class="btn s" data-act="undo-import" data-id="${b.id}">Undo import</button>`}</span></div>`)}</section>` : ""}`;
  },
  acts: {
    restore: (el) => { store.restore(el.dataset.col, el.dataset.id); toast("Restored.", { ms: 3000 }); },
    "file-restore": (el) => { store.update("files", el.dataset.id, { deletedAt: null, archived: false }); toast("File restored.", { ms: 3000 }); },
    "undo-import": (el) => A.undoImport(el.dataset.id),
    raw: async (el) => {
      const { modal, modalHead } = await import("../ui.js");
      const b = store.get("importBatches", el.dataset.id);
      modal(String(html`${modalHead("Original paste")}<pre class="snip" style="white-space:pre-wrap;max-height:60vh">${b.rawText}</pre>`), { wide: true });
    },
  },
};

let lastCheck = null;

export const settings = {
  title: "Settings",
  render() {
    const s = store.settings();
    const used = A.storageEstimate();
    const GiB = 1024 ** 3;
    const reads = db.readsToday();
    const local = db.info.mode === "local";
    const pct = (used / GiB) * 100;
    const stuckFiles = stuck();
    return html`
      <div class="page-h"><h1>Settings</h1></div>
      <div class="grid2">
        <div class="stack l">
          <section class="panel stack">
            <h3>Sync</h3>
            ${local ? html`<p><span class="st warn">Local mode</span></p><p>Your data lives only in this browser until you turn on sync. Export a backup.</p>
              <details><summary class="btn s ghost">How to turn on sync</summary><ol class="stack s" style="padding-left:20px;margin-top:8px">
                <li>Create a free Firebase project with Google sign-in and Firestore.</li><li>Paste its web config into the app config file (the README shows where).</li>
                <li>Deploy, then sign in on each device.</li><li>Export a backup here first, and import it after you sign in.</li></ol><p class="muted">The README has every click, step by step.</p></details>`
              : html`<p>Signed in as <b>${db.info.user?.email || db.info.user?.name || "you"}</b>.</p><p class="muted">Writes made offline wait on this device and sync on their own when the signal returns.</p><div class="row"><button class="btn" data-act="signout">Sign out</button></div>`}
            <p class="mono subtle">Status: ${store.status.state}${store.status.error ? ` · ${store.status.error}` : ""}</p>
          </section>
          <section class="panel stack">
            <h3>Backup</h3>
            <p>Last backup: <b class="mono">${s.lastBackupAt ? dateOf(s.lastBackupAt) : "never"}</b>${s.entriesSinceBackup ? html` · <span class="mono">${s.entriesSinceBackup}</span> new entries since` : ""}</p>
            <p class="muted">One JSON file with every record and every photo. Files in cloud storage are listed but not included; see the R2 backup guide. Importing merges by id and never overwrites anything newer.</p>
            <div class="row"><button class="btn primary" data-act="export-backup">${icon("download")}Export backup</button>
              <label class="btn" style="cursor:pointer">${icon("check")}Check a backup file<input type="file" accept=".json,application/json" class="sr" data-check></label>
              <label class="btn" style="cursor:pointer">${icon("upload")}Import backup<input type="file" accept=".json,application/json" class="sr" data-backup></label></div>
            ${lastCheck ? html`<div class="banner ${lastCheck.ok ? "" : "bad"}" role="status">${lastCheck.ok
              ? html`<span><span class="st ok">Valid backup</span> ${lastCheck.name}: schema ${lastCheck.fromSchema}${lastCheck.fromSchema !== lastCheck.schemaVersion ? ` (upgrades to ${lastCheck.schemaVersion})` : ""}, ${lastCheck.records} records, ${lastCheck.photos / 2 | 0} photos${lastCheck.exportedAt ? `, exported ${dateOf(lastCheck.exportedAt)}` : ""}. ${Object.entries(lastCheck.counts).map(([k, v]) => `${k} ${v}`).join(", ")}. Nothing was imported.</span>`
              : html`<span class="st bad">Not a usable backup: ${lastCheck.error}</span>`}</div>` : ""}
          </section>
          <section class="panel stack">
            <h3>Delete passcode</h3>
            <p class="muted">Fuse asks for this before a file is deleted or a completed project is reopened. It stops accidents, not attackers: the browser checks it, and the storage rules are the real protection.</p>
            <div class="row"><button class="btn" data-act="set-pass">${store.get("meta", "security")?.hash ? "Change passcode" : "Set passcode"}</button></div>
          </section>
          ${stuckFiles.length ? html`<section class="panel stack"><h3>Failed uploads</h3>
            ${stuckFiles.map((f) => html`<div class="spread" style="border-bottom:1px solid var(--line);min-height:48px"><span>${f.name} <span class="mono subtle">${fmtSize(f.size)} · ${dateOf(f.createdAt)}</span></span><span class="row"><button class="btn s" data-act="file-retry" data-id="${f.id}">Retry</button><button class="btn s ghost" data-act="file-archive" data-id="${f.id}">Archive</button></span></div>`)}</section>` : ""}
          <section class="panel stack">
            <h3>Storage</h3>
            <div class="spread"><span>Stored</span><span class="mono">${(used / 1048576).toFixed(1)} MB of 1 GiB · ${pct.toFixed(1)} percent</span></div>
            <div class="meter${pct > 70 ? " over" : ""}"><i style="width:${Math.min(100, pct)}%"></i></div>
            ${local ? "" : html`<div class="spread"><span>Reads today on this device</span><span class="mono">${reads} of 50 000</span></div>`}
            <p class="muted">You will be warned at 70 percent of either limit.</p>
          </section>
        </div>
        <div class="stack l">
          <section class="panel stack">
            <h3>Working screens</h3>
            <p class="muted">Home is always dark.</p>
            <div class="seg" role="group" aria-label="Theme">${["auto", "light", "dark"].map((t) => html`<button data-act="theme" data-t="${t}" aria-pressed="${(s.theme || "auto") === t}">${t === "auto" ? "Follow the system" : t[0].toUpperCase() + t.slice(1)}</button>`)}</div>
            <label class="f"><span>Default budget for new projects, Rp</span><input class="in" data-set="defaultBudgetIdr" inputmode="numeric" value="${s.defaultBudgetIdr ? new Intl.NumberFormat("id-ID").format(s.defaultBudgetIdr) : ""}"></label>
          </section>
          <section class="panel stack">
            <h3>Tracks</h3>
            ${store.all("tracks").map((t) => html`<input class="bare" data-edit="tracks.${t.id}.name" value="${t.name}" aria-label="Track name">`)}
            <form class="row" data-add-track><input class="in" name="n" placeholder="Coding, Renewable energy" style="flex:1" aria-label="Add a track"><button class="btn s">Add track</button></form>
          </section>
          <section class="panel stack">
            <h3>Sample data</h3>
            <p class="muted">The Line-follower v1 project from the mock, with parts, entries and skills. Every sample record is labelled, so removing it touches nothing of yours.</p>
            <div class="row">${hasSample() ? html`<button class="btn" data-act="sample-remove">Remove sample data</button>` : html`<button class="btn" data-act="sample-load">Load sample data</button>`}</div>
          </section>
          <section class="panel stack s"><h3>About</h3><p class="muted">Fuse · schema ${s.schemaVersion || store.SCHEMA_VERSION} · ${local ? "local mode" : "Firestore sync"}</p><p class="wm" style="font-size:15px">builtby<b>josef</b></p></section>
        </div>
      </div>`;
  },
  mount(root) {
    root.querySelector("[data-backup]")?.addEventListener("change", async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const r = await A.importBackup(await f.text());
        toast(`Backup imported: ${r.added} added, ${r.updated} updated, ${r.skipped} kept because yours were newer, ${r.photos / 2 | 0} photos.`, { ms: 8000 });
      } catch (err) { toast(`Could not import: ${err.message}`); }
      e.target.value = "";
    });
    root.querySelector("[data-check]")?.addEventListener("change", async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try { lastCheck = { ...checkBackup(await f.text()), name: f.name }; } catch (err) { lastCheck = { ok: false, error: err.message }; }
      e.target.value = "";
      store.notify();
    });
    root.querySelector("[data-set]")?.addEventListener("change", async (e) => { const { parseIdr } = await import("../util.js"); store.saveSettings({ [e.target.dataset.set]: parseIdr(e.target.value) }); });
    root.querySelector("[data-add-track]")?.addEventListener("submit", (e) => { e.preventDefault(); const n = e.target.n.value.trim(); if (n) store.add("tracks", { name: n, color: "#FF6A1A" }); });
  },
  acts: {
    signout: () => db.signOut(),
    "set-pass": async () => {
      const { ask } = await import("../ui.js");
      if (store.get("meta", "security")?.hash) {
        const old = await ask("Change passcode", [{ name: "c", label: "Current passcode", type: "password" }], { submit: "Next" });
        if (!old || !(await A.checkPasscode(old.c))) { if (old) toast("That passcode is not right."); return; }
      }
      const v = await ask("New delete passcode", [{ name: "a", label: "New passcode", type: "password" }, { name: "b", label: "Type it again", type: "password" }], { submit: "Save passcode" });
      if (!v) return;
      if (!v.a || v.a !== v.b) { toast("The two passcodes do not match."); return; }
      await A.setPasscode(v.a);
      toast("Passcode saved.", { ms: 3000 });
    },
    "file-retry": (el) => retry(el.dataset.id).catch((e) => toast(`${e.message} Open the project to pick the file again.`)),
    "file-archive": (el) => A.archiveWithUndo("files", el.dataset.id, "Upload"),
    theme: (el) => store.saveSettings({ theme: el.dataset.t }),
    "sample-load": () => { loadSample(); toast("Sample data loaded."); },
    "sample-remove": () => { const { undo } = store.undoable(() => removeSample()); toast("Sample data archived.", { undo }); },
  },
};
