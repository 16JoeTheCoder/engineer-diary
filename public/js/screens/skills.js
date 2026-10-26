// Skills as a heat grid grouped by domain. Levels are derived from evidence, never typed.
import * as store from "../store.js";
import * as A from "../actions.js";
import { html, raw, stamp } from "../util.js";
import { icon, toast } from "../ui.js";
import { LEVEL_RULES, PROOF_KINDS } from "../derive.js";

export const STARTER_DOMAINS = ["Electronics", "Embedded", "Mechanical", "Power and renewables", "Control", "Coding"];

const card = (s, l, sel) => html`<button class="skill" data-l="${l?.level || 0}" data-act="pick" data-id="${s.id}" aria-pressed="${sel}" aria-label="${s.name}, level ${l?.level || 0}, ${l?.proofCount || 0} proofs">
  <span class="lvl"><small>LV</small>${l?.level || 0}</span>
  <span class="nm">${s.name}</span>
  <span class="bar"><i style="width:${((l?.level || 0) / 5) * 100}%"></i></span>
  <span class="pc">${l?.level ? `${l.proofCount} proof${l.proofCount === 1 ? "" : "s"}` : "unproven"}</span></button>`;

function side(s, l) {
  const ev = store.all("evidence");
  const entries = store.all("entries").filter((e) => (e.skillIds || []).includes(s.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return html`<aside class="panel stack" style="position:sticky;top:16px">
    <input class="bare" data-edit="skills.${s.id}.name" value="${s.name}" aria-label="Skill name" style="font:700 22px/1.2 var(--font-sans)">
    <label class="f"><span>Domain</span><select class="in" data-edit="skills.${s.id}.domainId">${store.all("domains").sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((d) => html`<option value="${d.id}" ${d.id === s.domainId ? raw("selected") : ""}>${d.name}</option>`)}</select></label>
    <p class="label">How each level is earned</p>
    <ol class="rungs">${LEVEL_RULES.map((r, i) => html`<li class="${(l?.level || 0) > i ? "done" : ""}"><b>${i + 1}</b><span>${r}</span></li>`)}</ol>
    ${l && l.level > l.computed ? html`<p class="muted">Held at LV ${l.level}: a level never goes down, even if proof is archived.</p>` : ""}
    <p class="label">Entries and proof</p>
    ${entries.length ? html`<div class="stack s">${entries.slice(0, 20).map((e) => {
      const p = ev.filter((x) => x.entryId === e.id && PROOF_KINDS.has(x.kind));
      return html`<a href="#/entry/${e.id}" style="text-decoration:none" class="stack s"><span><span class="mono subtle" style="font-size:12px">${stamp(e.createdAt)}</span> <span class="mono ty-${e.type}" style="font-size:12px;font-weight:700;text-transform:uppercase;filter:brightness(.8)">${e.type}</span></span><span>${e.title || "(untitled)"}</span>
        <span class="row" style="gap:4px">${p.length ? p.map((x) => html`<span class="chip">${x.kind === "measurement" ? `${x.value} ${x.unit}` : x.kind}</span>`) : html`<span class="chip dash">NEEDS PROOF</span>`}</span></a>`;
    })}</div>` : html`<p class="muted">Tag this skill on an entry to start.</p>`}
    <div class="row end"><button class="btn danger s" data-act="skill-archive" data-id="${s.id}">${icon("archive")}Archive skill</button></div>
  </aside>`;
}

export default {
  title: "Skills",
  render(ctx) {
    const lv = A.levels();
    const domains = store.all("domains").sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const skills = store.all("skills");
    const sel = ctx.query.s && store.get("skills", ctx.query.s);
    const orphans = skills.filter((s) => !domains.some((d) => d.id === s.domainId));
    const proven = skills.filter((s) => (lv.get(s.id)?.level || 0) >= 2).length;
    const group = (d, list) => html`<section>
      <div class="domain-h">${d ? html`<input class="bare" data-edit="domains.${d.id}.name" value="${d.name}" aria-label="Domain name" style="font:700 17px/1.3 var(--font-sans);max-width:22ch">
        <button class="btn s icon ghost" data-act="dom-move" data-id="${d.id}" data-dir="-1" aria-label="Move domain up">${icon("up")}</button>
        <button class="btn s icon ghost" data-act="dom-move" data-id="${d.id}" data-dir="1" aria-label="Move domain down">${icon("down")}</button>
        <button class="btn s icon ghost" data-act="dom-archive" data-id="${d.id}" aria-label="Archive domain">${icon("trash")}</button>` : html`<h3>Unsorted</h3>`}</div>
      <div class="heat-grid">${list.map((s) => card(s, lv.get(s.id), sel?.id === s.id))}
        ${d ? html`<form data-add-skill="${d.id}" class="skill" data-l="0" style="cursor:default;align-content:center"><input class="bare" name="n" placeholder="Add a skill" aria-label="Add a skill to ${d.name}"></form>` : ""}</div></section>`;
    return html`
      <div class="page-h"><h1>Heat is <b class="grad-text">proof.</b></h1><p class="muted">${proven} of ${skills.length} skills have proof. Dashed means unproven.</p></div>
      ${domains.length ? "" : html`<div class="empty">No domains yet.<button class="btn primary" data-act="starter">Add the starter domains</button><span class="subtle">${STARTER_DOMAINS.join(", ")}. All editable.</span></div>`}
      <div class="skills-layout">
        <div>${domains.map((d) => group(d, skills.filter((s) => s.domainId === d.id).sort((a, b) => a.name.localeCompare(b.name))))}${orphans.length ? group(null, orphans) : ""}
          ${domains.length ? html`<form data-add-domain class="row" style="margin-top:24px"><input class="in" name="n" placeholder="Add a domain" aria-label="Add a domain" style="max-width:320px"><button class="btn s">Add domain</button></form>` : ""}</div>
        ${sel ? side(sel, lv.get(sel.id)) : html`<aside class="panel stack"><h3>Levels</h3><ol class="rungs">${LEVEL_RULES.map((r, i) => html`<li><b>${i + 1}</b><span>${r}</span></li>`)}</ol><p class="muted">Finishing a task never raises a level by itself. Only saved evidence does. Pick a skill to see its proof.</p></aside>`}
      </div>`;
  },
  mount(root) {
    root.querySelectorAll("[data-add-skill]").forEach((f) => f.addEventListener("submit", (e) => {
      e.preventDefault();
      const n = f.n.value.trim();
      if (n) store.add("skills", { name: n, domainId: f.dataset.addSkill, why: "", peakLevel: 0 });
    }));
    root.querySelector("[data-add-domain]")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const n = e.target.n.value.trim();
      if (n) store.add("domains", { name: n, order: store.all("domains").length });
    });
  },
  acts: {
    pick: (el) => { location.hash = `#/skills?s=${el.dataset.id}`; },
    starter: () => seedDomains(),
    "skill-archive": (el) => { A.archiveWithUndo("skills", el.dataset.id, "Skill"); location.hash = "#/skills"; },
    "dom-archive": (el) => {
      const n = store.all("skills").filter((s) => s.domainId === el.dataset.id).length;
      if (n) { toast(`Move its ${n} skill${n === 1 ? "" : "s"} to another domain first.`); return; }
      A.archiveWithUndo("domains", el.dataset.id, "Domain");
    },
    "dom-move": (el) => {
      const list = store.all("domains").sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const i = list.findIndex((d) => d.id === el.dataset.id), j = i + +el.dataset.dir;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      const t = new Date().toISOString();
      store.commit(list.map((d, k) => ({ col: "domains", doc: { ...d, order: k, updatedAt: t } }))).catch(() => {});
    },
  },
};

export function seedDomains() {
  const have = new Set(store.all("domains").map((d) => d.name.toLowerCase()));
  const base = store.all("domains").length;
  STARTER_DOMAINS.filter((n) => !have.has(n.toLowerCase())).forEach((name, i) => store.add("domains", { name, order: base + i }));
}
