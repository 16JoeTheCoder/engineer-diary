// Every entry, newest first, filterable by type and project.
import * as store from "../store.js";
import { html, raw, stamp, hours } from "../util.js";
import { proofByEntry } from "../derive.js";

const TYPES = ["build", "fail", "decision", "experiment", "purchase", "reflect"];

export default {
  title: "Log",
  render(ctx) {
    const { type = "", project = "" } = ctx.query;
    const proofs = proofByEntry(store.all("evidence"));
    const list = store.all("entries").filter((e) => (!type || e.type === type) && (!project || e.projectId === project)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const q = (o) => "#/log?" + new URLSearchParams(Object.entries({ type, project, ...o }).filter(([, v]) => v)).toString();
    return html`
      <div class="page-h"><h1>Everything you did, <b>with proof.</b></h1><a class="btn hot" href="#/entry/new">Log entry</a></div>
      <div class="row" style="margin-bottom:16px">
        <div class="seg" role="group" aria-label="Type"><button data-act="go" data-h="${q({ type: "" })}" aria-pressed="${!type}">All</button>${TYPES.map((t) => html`<button data-act="go" data-h="${q({ type: t })}" aria-pressed="${t === type}">${t}</button>`)}</div>
        <select class="in" style="width:auto" data-filter aria-label="Project"><option value="">All projects</option>${store.all("projects").map((p) => html`<option value="${p.id}" ${p.id === project ? raw("selected") : ""}>${p.name}</option>`)}</select>
      </div>
      <section class="console">
        <div class="bar"><span class="dots"><i></i><i></i><i></i></span><span>fuse.log · ${list.length} entries · ${hours(list.reduce((n, e) => n + (e.sessionSec || 0), 0))} h</span></div>
        <div class="lines">${list.map((e) => html`<a class="ln" href="#/entry/${e.id}"><span class="ts">${stamp(e.createdAt)}</span><span class="ty ty-${e.type}">${e.type}</span><span class="tx">${e.title || "(untitled)"}${proofs.get(e.id) ? ` · ${proofs.get(e.id)} proof` : ""}${(e.tags || []).length ? "  #" + e.tags.join(" #") : ""}</span></a>`)}
        ${list.length ? "" : html`<span class="ts">No entries match.</span>`}</div>
      </section>`;
  },
  mount(root, ctx) {
    root.querySelector("[data-filter]")?.addEventListener("change", (e) => {
      const p = new URLSearchParams({ ...ctx.query, project: e.target.value });
      if (!e.target.value) p.delete("project");
      location.hash = "#/log?" + p.toString();
    });
  },
  acts: { go: (el) => { location.hash = el.dataset.h; } },
};
