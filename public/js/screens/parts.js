// Parts inventory: tabs by status, one-tap Lost and Found it, restore, part detail with links and purchases.
import * as store from "../store.js";
import * as A from "../actions.js";
import { html, raw, rp, dateOf, stamp, shopFromUrl, searchLinks, safeUrl } from "../util.js";
import { icon, toast, modal, modalHead } from "../ui.js";
import { buyDialog } from "./project.js";

const TABS = [
  ["all", "All", () => true],
  ["in_use", "In use", (p) => p.status === "in_use" || p.status === "tested"],
  ["spare", "Spare", (p) => p.status === "spare" || p.status === "arrived"],
  ["wishlist", "Wishlist", (p) => p.status === "wishlist" || p.status === "planned"],
  ["ordered", "Ordered", (p) => p.status === "ordered"],
  ["lost", "Lost", (p) => p.status === "lost"],
  ["retired", "Retired", (p) => p.status === "retired"],
];
const ADD_STATUS = { in_use: "in_use", spare: "spare", ordered: "ordered", retired: "spare", lost: "spare" };

const projectName = (id) => store.get("projects", id)?.name || "";
const statusSelect = (p) => html`<select class="bare" data-edit="parts.${p.id}.status" aria-label="Status of ${p.name}">${A.PART_STATUSES.filter((s) => s !== "lost" || p.status === "lost").map((s) => html`<option value="${s}" ${s === p.status ? raw("selected") : ""}>${A.statusLabel(s)}</option>`)}</select>`;

function lostCard(p) {
  const from = p.lostFrom || {};
  return html`<div class="lost-card">
    <div class="spread"><h3>${p.name}</h3><span class="st warn">Lost</span></div>
    <p class="muted">Lost <span class="mono">${dateOf(p.lostAt)}</span>. Last seen: ${A.statusLabel(from.status) || "unknown"}${from.projectId ? ` in ${projectName(from.projectId) || "a project"}` : ""}. Qty ${p.qty}.</p>
    <button class="btn found" data-act="restore" data-id="${p.id}">${icon("pin")}Found it, restore</button>
  </div>`;
}

function row(p) {
  const links = (p.links || []).filter((l) => safeUrl(l.url));
  return html`<div class="part-row">
    <button class="nm" data-act="open" data-id="${p.id}">${p.name}<small>${[p.category, p.projectId && projectName(p.projectId), p.lastPaidIdr != null && `last paid ${rp(p.lastPaidIdr)}`].filter(Boolean).join(" · ") || "Tap for details"}</small></button>
    <input class="bare num-in hide-s" style="width:4.5em" data-edit="parts.${p.id}.qty" data-type="int" inputmode="numeric" value="${p.qty}" aria-label="Quantity of ${p.name}">
    <span class="hide-s">${statusSelect(p)}</span>
    <span class="links hide-s">${links.map((l) => html`<a class="chip" href="${safeUrl(l.url)}" target="_blank" rel="noopener noreferrer">${l.shop}${icon("external")}</a>`)}${(p.tags || []).map((t) => html`<button class="tag" style="background:none;border:0;cursor:pointer;min-height:32px" data-act="tag" data-t="${t}">#${t}</button>`)}</span>
    <span class="row" style="gap:2px;flex-wrap:nowrap">${p.status === "lost" ? html`<button class="btn s" data-act="restore" data-id="${p.id}">Found it</button>` : p.status !== "retired" ? html`<button class="btn s" data-act="lost" data-id="${p.id}">Lost</button>` : ""}</span>
  </div>`;
}

let openedFor = null;

export default {
  title: "Parts",
  render(ctx) {
    const tab = ctx.query.tab || "all";
    const parts = store.all("parts").sort((a, b) => a.name.localeCompare(b.name));
    const def = TABS.find((t) => t[0] === tab) || TABS[0];
    const list = parts.filter(def[2]);
    const lostN = parts.filter((p) => p.status === "lost").length;
    return html`
      <div class="page-h"><h1>Everything you own, <b>and everything you lost.</b></h1></div>
      <nav class="tabs" aria-label="Part status">${TABS.map(([k, l, f]) => html`<a href="#/parts?tab=${k}" ${k === def[0] ? raw('aria-current="page"') : ""}>${l} <span class="n">${parts.filter(f).length}</span></a>`)}</nav>
      ${def[0] !== "lost" && def[0] !== "all" || !lostN ? "" : html`<a class="banner warn" href="#/parts?tab=lost" style="text-decoration:none"><span class="st warn">${lostN} part${lostN === 1 ? " is" : "s are"} lost. One tap restores each to exactly where it was.</span><span class="btn s">Open Lost</span></a>`}
      ${def[0] === "lost" ? "" : html`<form class="row" data-add-part style="margin-bottom:12px"><input class="in" name="n" placeholder="Add a part, then press Enter" aria-label="Add a part" style="flex:1"><button class="btn primary">Add</button></form>`}
      ${def[0] === "lost"
        ? (list.length ? html`<div class="lost-grid">${list.map(lostCard)}</div>` : html`<div class="empty">Nothing lost. Marking a part lost is one tap, and so is getting it back.</div>`)
        : list.length ? html`<div>${list.map(row)}</div>` : html`<div class="empty">No parts here yet.</div>`}`;
  },
  mount(root, ctx) {
    root.querySelector("[data-add-part]")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const n = e.target.n.value.trim();
      if (!n) return;
      const { part, created } = A.findOrCreatePart(n, { status: ADD_STATUS[ctx.query.tab] || "wishlist" });
      toast(created ? `${part.name} added.` : `You already have ${part.name} (${A.statusLabel(part.status)}).`, { action: () => openPart(part.id), actionLabel: "Details", ms: 5000 });
    });
    if (ctx.query.open && openedFor !== ctx.query.open) { openedFor = ctx.query.open; openPart(ctx.query.open); }
    if (!ctx.query.open) openedFor = null;
  },
  acts: {
    open: (el) => openPart(el.dataset.id),
    lost: (el) => A.markLost(el.dataset.id),
    restore: (el) => A.restorePart(el.dataset.id),
    tag: async (el) => { const { openSearch } = await import("../app.js"); openSearch(`#${el.dataset.t}`); },
  },
};

export function openPart(id) {
  let root;
  const draw = () => {
    const p = store.get("parts", id) || store.all("parts", { archived: true }).find((x) => x.id === id);
    if (!p) return html`${modalHead("Part")}<p class="muted">Not found.</p>`;
    const purchases = store.all("purchases").filter((x) => x.partId === id).sort((a, b) => b.date.localeCompare(a.date));
    const projects = store.all("projects");
    return html`${modalHead(p.name)}
      <div class="stack">
        ${p.status === "lost" ? lostCard(p) : ""}
        <div class="grid2" style="gap:12px">
          <label class="f"><span>Name</span><input class="in" data-edit="parts.${p.id}.name" value="${p.name}"></label>
          <label class="f"><span>Category</span><input class="in" data-edit="parts.${p.id}.category" value="${p.category || ""}" placeholder="sensor, driver, power"></label>
          <label class="f"><span>Quantity</span><input class="in" data-edit="parts.${p.id}.qty" data-type="int" inputmode="numeric" value="${p.qty}"></label>
          <label class="f"><span>Status</span>${statusSelect(p)}</label>
          <label class="f"><span>Project</span><select class="in" data-edit="parts.${p.id}.projectId" data-type="null"><option value="">None (spare)</option>${projects.map((x) => html`<option value="${x.id}" ${x.id === p.projectId ? raw("selected") : ""}>${x.name}</option>`)}</select></label>
          <label class="f"><span>Tags</span><input class="in" data-edit="parts.${p.id}.tags" data-type="tags" value="${(p.tags || []).join(", ")}" placeholder="motor, 5v"></label>
        </div>
        <section class="stack s"><p class="label">Purchase links</p>
          ${(p.links || []).map((l, i) => html`<div class="row" style="flex-wrap:nowrap"><span class="chip">${l.shop}</span>${safeUrl(l.url) ? html`<a href="${safeUrl(l.url)}" target="_blank" rel="noopener noreferrer" class="mono" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;font-size:13px">${l.url}</a>` : html`<span class="muted">${l.url}</span>`}<button class="btn s icon ghost" data-p="unlink" data-i="${i}" aria-label="Remove link">${icon("trash")}</button></div>`)}
          <form class="row" data-link><input class="in" name="u" type="url" inputmode="url" placeholder="Paste a Shopee or Tokopedia link" style="flex:1" aria-label="Paste a product link"><button class="btn s">Add link</button></form>
          <label class="f"><span>Search words</span><input class="in" data-edit="parts.${p.id}.searchQuery" value="${p.searchQuery || ""}" placeholder="TB6612FNG motor driver module"></label>
          <div class="row">${searchLinks(p.searchQuery || p.name).map((x) => html`<a class="btn s" href="${x.url}" target="_blank" rel="noopener noreferrer">${icon("search")}Search ${x.shop}</a>`)}</div>
        </section>
        <section class="stack s"><div class="spread"><p class="label">Purchases · the only price history</p><button class="btn s primary" data-p="buy">Record purchase</button></div>
          ${purchases.length ? html`<table class="t"><tbody>${purchases.map((x) => html`<tr><td class="mono">${x.date}</td><td>${x.shop || ""}</td><td class="r mono">${x.qty} × ${rp(x.priceIdr)}</td><td>${projectName(x.projectId)}</td></tr>`)}</tbody></table>` : html`<p class="muted">Nothing bought yet.${p.priceIsEstimate ? " The plan price is an estimate." : ""}</p>`}
        </section>
        <details><summary class="label" style="cursor:pointer;min-height:36px;display:flex;align-items:center">Status history</summary>
          <ul class="mono" style="font-size:13px;padding-left:18px">${(p.statusLog || []).slice().reverse().map((s) => html`<li>${stamp(s.at)} ${A.statusLabel(s.status)}${s.note ? ` · ${s.note}` : ""}</li>`)}</ul></details>
        <div class="row end">
          ${p.status === "lost" ? "" : html`<button class="btn" data-p="lost">Mark lost</button>`}
          ${p.status === "retired" ? "" : html`<button class="btn" data-p="retire">Retire</button>`}
          <button class="btn danger" data-p="archive">${icon("archive")}Archive</button>
        </div>
      </div>`;
  };
  const paint = () => { if (root) { const a = document.activeElement; const k = a?.dataset?.edit; root.innerHTML = String(draw()); if (k) root.querySelector(`[data-edit="${CSS.escape(k)}"]`)?.focus(); } };
  const off = store.onChange(paint);
  modal(String(draw()), {
    wide: true, label: "Part details", onClose: () => { off(); if (location.hash.includes("open=")) history.replaceState(null, "", location.hash.replace(/[?&]open=[^&]*/, "")); },
    onMount: (r, close) => {
      root = r;
      r.addEventListener("submit", (e) => {
        if (!e.target.matches("[data-link]")) return;
        e.preventDefault();
        const url = safeUrl(e.target.u.value.trim());
        if (!url) { toast("That does not look like a web link."); return; }
        const p = store.get("parts", id);
        store.update("parts", id, { links: [...(p.links || []), { shop: shopFromUrl(url), url }] });
      });
      r.addEventListener("click", (e) => {
        if (e.target.closest('[data-act="restore"]')) { A.restorePart(id); return; }
        const b = e.target.closest("[data-p]");
        if (!b) return;
        const p = store.get("parts", id);
        const x = b.dataset.p;
        if (x === "unlink") { const links = [...p.links]; links.splice(+b.dataset.i, 1); const { undo } = store.undoable(() => store.update("parts", id, { links })); toast("Link removed.", { undo }); }
        if (x === "buy") { close(); buyDialog(null, p); }
        if (x === "lost") A.markLost(id);
        if (x === "retire") { const { undo } = store.undoable(() => A.setPartStatus(id, "retired", { projectId: null })); toast(`${p.name} retired.`, { undo }); }
        if (x === "archive") { close(); A.archiveWithUndo("parts", id, p.name); }
      });
    },
  });
}
