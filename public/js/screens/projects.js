// Projects grouped by track, each with its mini fuse, budget and next action.
import * as store from "../store.js";
import * as A from "../actions.js";
import { html, rp } from "../util.js";
import { icon } from "../ui.js";
import { nextAction, projectCosts } from "../derive.js";
import { fuse } from "./project.js";
import { newProject } from "./home.js";

export default {
  title: "Projects",
  render() {
    const d = A.data();
    const tracks = store.all("tracks");
    const projects = store.all("projects").sort((a, b) => (!!a.closedAt - !!b.closedAt) || b.updatedAt.localeCompare(a.updatedAt));
    const orphan = projects.filter((p) => !tracks.some((t) => t.id === p.trackId));
    const card = (p) => {
      const c = projectCosts(d, p.id, p);
      const na = nextAction(d, p);
      return html`<a class="panel lift stack" href="#/p/${p.id}" style="text-decoration:none">
        <div class="spread"><h3>${p.name}</h3>${p.closedAt ? html`<span class="st ok">Closed</span>` : html`<span class="label">${p.stage}</span>`}</div>
        ${fuse(p, { mini: true })}
        <p class="muted" style="min-height:24px">${p.closedAt ? `Closed ${p.closedAt.slice(0, 10)}` : na.text ? `Next: ${na.text}` : "No open tasks"}</p>
        <p class="mono subtle" style="font-size:13px">${rp(c.planned)} planned · ${rp(c.actual)} spent${c.cap ? ` · cap ${rp(c.cap)}` : ""}</p>
      </a>`;
    };
    const group = (name, list) => list.length ? html`<section class="stack" style="margin-bottom:28px"><p class="label">${name}</p><div class="grid3">${list.map(card)}</div></section>` : "";
    return html`
      <div class="page-h"><h1>Every build, <b>one fuse each.</b></h1>
        <div class="row"><a class="btn" href="#/import">${icon("upload")}Import a plan</a><button class="btn primary" data-act="new">New project</button></div></div>
      ${projects.length ? "" : html`<div class="empty">No projects yet.<div class="row"><a class="btn hot" href="#/import">Import a plan</a><button class="btn" data-act="new">New project</button></div></div>`}
      ${tracks.map((t) => group(t.name, projects.filter((p) => p.trackId === t.id)))}
      ${group("No track", orphan)}`;
  },
  acts: { new: newProject },
};
