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
        <div class="spread"><h3>${p.name}</h3>${p.status === "complete" ? html`<span class="st ok">Complete</span>` : p.closedAt ? html`<span class="st ok">Closed</span>` : html`<span class="label">${p.stage}</span>`}</div>
        ${fuse(p, { mini: true })}
        <p class="muted" style="min-height:24px">${p.closedAt ? `Closed ${p.closedAt.slice(0, 10)}` : na.text ? `Next: ${na.text}` : "No open tasks"}</p>
        ${p.mode === "flow" && p.status !== "complete" ? html`<p class="label">Flowstate · station ${p.station || 1} of 7</p>` : ""}
        <p class="mono subtle" style="font-size:13px">${rp(c.planned)} planned · ${rp(c.actual)} spent${c.cap ? ` · cap ${rp(c.cap)}` : ""}</p>
      </a>`;
    };
    const group = (name, list) => list.length ? html`<section class="stack" style="margin-bottom:28px"><p class="label">${name}</p><div class="grid3">${list.map(card)}</div></section>` : "";
    return html`
      <div class="page-h"><h1>Projects</h1>
        <div class="row"><a class="btn" href="#/import">${icon("upload")}Import a plan</a><button class="btn primary" data-act="new">New project</button></div></div>
      ${projects.filter((p) => p.mode === "flow" && p.status !== "complete" && !p.closedAt).slice(0, 1).map((p) => html`<a class="btn" href="#/flow/${p.id}" style="margin-bottom:24px">Continue Flowstate: ${p.name}</a>`)}
      ${projects.length ? "" : html`<div class="empty">No projects yet. A project holds the plan, the parts and the proof for one build.<div class="row"><button class="btn primary" data-act="new">Start Flowstate</button><a class="btn" href="#/import">Import a plan</a></div></div>`}
      ${tracks.map((t) => group(t.name, projects.filter((p) => p.trackId === t.id)))}
      ${group("No track", orphan)}`;
  },
  acts: { new: newProject },
};
