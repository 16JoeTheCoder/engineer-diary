// Library (resources), Archive (restore anything), Settings (sync, backup, storage, theme, tracks, sample data).
import * as store from "../store.js";
import * as A from "../actions.js";
import * as db from "../db.js";
import { html, raw, dateOf, safeUrl, stamp } from "../util.js";
import { icon, toast } from "../ui.js";
import { loadSample, removeSample, hasSample } from "../sample.js";

const RTYPES = ["video", "course", "datasheet", "article", "tool"];

export const library = {
  title: "Library",
  render() {
    const list = store.all("resources").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const skills = store.all("skills");
    return html`
      <div class="page-h"><h1>What you learned from, <b>kept.</b></h1></div>
      <form class="panel stack" data-add-res>
        <h3>Add a resource</h3>
        <div class="grid2" style="gap:12px">
          <input class="in" name="title" placeholder="TB6612FNG datasheet" aria-label="Title" required>
          <input class="in" name="url" type="url" inputmode="url" placeholder="https:// (optional)" aria-label="Link">
        </div>
        <div class="row"><select class="in" name="type" style="width:auto" aria-label="Type">${RTYPES.map((t) => html`<option>${t}</option>`)}</select><input class="in" name="note" placeholder="Note" aria-label="Note" style="flex:1"><button class="btn primary">Add</button></div>
      </form>
      <div class="stack" style="margin-top:20px">${list.map((r) => html`<div class="panel stack s">
        <div class="row" style="flex-wrap:nowrap"><select class="bare" data-edit="resources.${r.id}.type" style="width:auto" aria-label="Type">${RTYPES.map((t) => html`<option ${t === r.type ? raw("selected") : ""}>${t}</option>`)}</select>
          <input class="bare" data-edit="resources.${r.id}.title" value="${r.title}" aria-label="Title" style="font-weight:700">
          ${safeUrl(r.url) ? html`<a class="btn s icon ghost" href="${safeUrl(r.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open link">${icon("external")}</a>` : ""}
          <button class="btn s icon ghost" data-act="res-archive" data-id="${r.id}" aria-label="Archive">${icon("trash")}</button></div>
        <input class="bare" data-edit="resources.${r.id}.note" value="${r.note || ""}" placeholder="Note" aria-label="Note">
        <input class="bare mono" data-edit="resources.${r.id}.url" value="${r.url || ""}" placeholder="Link" aria-label="Link" style="font-size:13px">
        ${skills.length ? html`<div class="row" style="gap:4px"><span class="label">Skills</span>${skills.map((s) => html`<button class="chip ${(r.skillIds || []).includes(s.id) ? "on" : ""}" data-act="res-skill" data-id="${r.id}" data-s="${s.id}">${s.name}</button>`)}</div>` : ""}
      </div>`)}${list.length ? "" : html`<div class="empty">No resources yet. A resource tagged to a skill counts as level 1.</div>`}</div>`;
  },
  mount(root) {
    root.querySelector("[data-add-res]")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(e.target));
      store.add("resources", { title: v.title.trim(), url: safeUrl(v.url) || "", type: v.type, note: v.note.trim(), projectId: A.activeProject()?.id || null, skillIds: [] });
      e.target.reset();
    });
  },
  acts: {
    "res-archive": (el) => A.archiveWithUndo("resources", el.dataset.id, "Resource"),
    "res-skill": (el) => { const r = store.get("resources", el.dataset.id); const s = el.dataset.s; const ids = r.skillIds || []; store.update("resources", r.id, { skillIds: ids.includes(s) ? ids.filter((x) => x !== s) : [...ids, s] }); },
  },
};

const LABELS = { projects: "Projects", parts: "Parts", entries: "Entries", tasks: "Tasks", skills: "Skills", domains: "Domains", bomLines: "BOM lines", evidence: "Evidence", resources: "Resources", purchases: "Purchases", tracks: "Tracks" };
const nameOf = (col, d) => d.name || d.title || d.caption || d.text?.slice(0, 40) || (col === "bomLines" ? `${d.name || "line"}` : col === "purchases" ? `${d.date} purchase` : d.kind || d.id);

export const archive = {
  title: "Archive",
  render() {
    const groups = Object.keys(LABELS).map((col) => [col, store.all(col, { archived: true }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))]).filter(([, l]) => l.length);
    const batches = store.all("importBatches").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return html`
      <div class="page-h"><h1>Nothing is deleted. <b>Restore anything.</b></h1></div>
      ${groups.length ? groups.map(([col, list]) => html`<section class="panel" style="margin-bottom:16px"><div class="panel-h"><h3>${LABELS[col]}</h3><span class="mono muted">${list.length}</span></div>
        ${list.slice(0, 100).map((d) => html`<div class="spread" style="border-bottom:1px solid var(--line);min-height:48px"><span>${nameOf(col, d)} <span class="mono subtle" style="font-size:12px">archived ${dateOf(d.updatedAt)}</span></span><button class="btn s" data-act="restore" data-col="${col}" data-id="${d.id}">Restore</button></div>`)}</section>`)
        : html`<div class="empty">The archive is empty.</div>`}
      ${batches.length ? html`<section class="panel"><h3>Plan imports</h3><p class="muted">The original paste is kept untouched for each import.</p>
        ${batches.map((b) => html`<div class="spread" style="border-bottom:1px solid var(--line);min-height:52px"><span>${stamp(b.createdAt)} · ${store.get("projects", b.projectId)?.name || store.all("projects", { archived: true }).find((p) => p.id === b.projectId)?.name || "Project"} ${b.undone ? html`<span class="st warn">Undone</span>` : ""}</span>
          <span class="row"><button class="btn s" data-act="raw" data-id="${b.id}">View original</button>${b.undone ? "" : html`<button class="btn s" data-act="undo-import" data-id="${b.id}">Undo import</button>`}</span></div>`)}</section>` : ""}`;
  },
  acts: {
    restore: (el) => { store.restore(el.dataset.col, el.dataset.id); toast("Restored.", { ms: 3000 }); },
    "undo-import": (el) => A.undoImport(el.dataset.id),
    raw: async (el) => {
      const { modal, modalHead } = await import("../ui.js");
      const b = store.get("importBatches", el.dataset.id);
      modal(String(html`${modalHead("Original paste")}<pre class="snip" style="white-space:pre-wrap;max-height:60vh">${b.rawText}</pre>`), { wide: true });
    },
  },
};

export const settings = {
  title: "Settings",
  render() {
    const s = store.settings();
    const used = A.storageEstimate();
    const GiB = 1024 ** 3;
    const reads = db.readsToday();
    const local = db.info.mode === "local";
    const pct = (used / GiB) * 100;
    return html`
      <div class="page-h"><h1>Three copies. <b>Always.</b></h1></div>
      <div class="grid2">
        <div class="stack l">
          <section class="panel stack">
            <h3>Sync</h3>
            ${local ? html`<p><span class="st warn">Local mode</span></p><p class="muted">Data stays in this browser only. To sync across devices, create the Firebase project and paste its config into <code>js/config.js</code>. The README lists the steps. Export a backup first, then import it after you sign in.</p>`
              : html`<p>Signed in as <b>${db.info.user?.email || db.info.user?.name || "you"}</b>.</p><p class="muted">Writes made offline wait on this device and sync on their own when the signal returns.</p><div class="row"><button class="btn" data-act="signout">Sign out</button></div>`}
            <p class="mono subtle" style="font-size:13px">Status: ${store.status.state}${store.status.error ? ` · ${store.status.error}` : ""}</p>
          </section>
          <section class="panel stack">
            <h3>Backup</h3>
            <p>Last backup: <b class="mono">${s.lastBackupAt ? dateOf(s.lastBackupAt) : "never"}</b></p>
            <p class="muted">One JSON file with every record and every photo. Importing merges by id and never overwrites anything newer.</p>
            <div class="row"><button class="btn hot" data-act="export-backup">${icon("download")}Export backup</button><label class="btn" style="cursor:pointer">${icon("upload")}Import backup<input type="file" accept=".json,application/json" class="sr" data-backup></label></div>
          </section>
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
            <p class="muted">Home and the completion card are always dark.</p>
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
    root.querySelector("[data-set]")?.addEventListener("change", async (e) => { const { parseIdr } = await import("../util.js"); store.saveSettings({ [e.target.dataset.set]: parseIdr(e.target.value) }); });
    root.querySelector("[data-add-track]")?.addEventListener("submit", (e) => { e.preventDefault(); const n = e.target.n.value.trim(); if (n) store.add("tracks", { name: n, color: "#FF6A1A" }); });
  },
  acts: {
    signout: () => db.signOut(),
    theme: (el) => store.saveSettings({ theme: el.dataset.t }),
    "sample-load": () => { loadSample(); toast("Sample data loaded."); },
    "sample-remove": () => { const { undo } = store.undoable(() => removeSample()); toast("Sample data archived.", { undo }); },
  },
};
