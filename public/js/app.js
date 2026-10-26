// Boot, router, shell, global events. Screens are modules: { render(ctx) -> html, mount?(root, ctx), acts?, dark? }.
import * as store from "./store.js";
import * as db from "./db.js";
import * as A from "./actions.js";
import { html, raw, esc, dateOf, coerce } from "./util.js";
import { icon, toast, modal } from "./ui.js";
import { search } from "./search.js";
import home from "./screens/home.js";
import projects from "./screens/projects.js";
import project from "./screens/project.js";
import parts from "./screens/parts.js";
import entry from "./screens/entry.js";
import log from "./screens/log.js";
import skills from "./screens/skills.js";
import importer from "./screens/importer.js";
import { library, archive, settings } from "./screens/more.js";

const SCREENS = { home, projects, p: project, parts, entry, log, skills, import: importer, library, archive, settings };
const NAV = [
  ["home", "Home", "home"], ["projects", "Projects", "folder"], ["log", "Log", "list"], ["parts", "Parts", "box"],
  ["skills", "Skills", "zap"], ["import", "Import a plan", "upload"], ["library", "Library", "book"], ["archive", "Archive", "archive"], ["settings", "Settings", "settings"],
];

let authState = "loading"; // loading | in | out
let firstHome = true;
const $main = () => document.getElementById("main");

export function route() {
  const h = location.hash.replace(/^#\/?/, "");
  const [path, qs] = h.split("?");
  const seg = path.split("/").filter(Boolean);
  return { name: seg[0] || "home", id: seg[1] || null, query: Object.fromEntries(new URLSearchParams(qs || "")) };
}
export const go = (hash) => { if (location.hash === hash) render(); else location.hash = hash; };

// ---------- shell ----------
function syncPill() {
  const s = store.status;
  const words = { synced: "Synced", pending: "Pending sync", offline: "Offline, saved on device", error: "Writes failing", local: "Local only", loading: "Loading" };
  return html`<span class="sync" data-s="${s.state}" role="status" title="${s.error || ""}"><i></i>${words[s.state] || s.state}</span>`;
}

function shell() {
  const r = route();
  const cur = (n) => (r.name === n || (n === "projects" && r.name === "p") ? raw('aria-current="page"') : "");
  const s = store.settings();
  return html`
  <div class="shell">
    <aside class="side" aria-label="Main">
      <a class="brand" href="#/home"><img src="assets/logos/tab-small.svg" alt="" width="20" height="36"><span><span class="app">Fuse</span><span class="wm">builtby<b>josef</b></span></span></a>
      <button class="search-field" data-act="search">${icon("search")}<span>Search</span><kbd>/</kbd></button>
      <nav class="nav stack s" style="margin-top:8px">${NAV.map(([n, l, i]) => html`<a href="#/${n}" ${cur(n)}>${icon(i)}${l}</a>`)}</nav>
      <div class="grow"></div>
      <div class="foot">
        <span id="sync-slot">${syncPill()}</span>
        <span class="muted mono">Last backup: ${s.lastBackupAt ? dateOf(s.lastBackupAt) : "never"}</span>
      </div>
    </aside>
    <header class="topbar">
      <a class="brand" href="#/home"><img src="assets/logos/tab-small.svg" alt="" width="16" height="28"><span class="app">Fuse</span></a>
      <span id="sync-slot-s">${syncPill()}</span>
      <span class="grow"></span>
      <button class="btn icon ghost" data-act="search" aria-label="Search">${icon("search")}</button>
      <button class="btn icon ghost" data-act="menu" aria-label="Menu">${icon("menu")}</button>
    </header>
    <main class="main" id="main" tabindex="-1"></main>
    <nav class="bottombar" aria-label="Main">
      <a href="#/home" ${cur("home")}>${icon("home")}Home</a>
      <a href="#/projects" ${cur("projects")}>${icon("folder")}Projects</a>
      <button class="plus" data-act="quick" aria-label="Log an entry">${icon("plus")}</button>
      <a href="#/skills" ${cur("skills")}>${icon("zap")}Skills</a>
      <a href="#/parts" ${cur("parts")}>${icon("box")}Parts</a>
    </nav>
  </div>`;
}

function signature() {
  return html`<footer class="sig"><img src="assets/logos/tab-small.svg" alt="" width="11" height="20"><span class="wm">builtby<b>josef</b></span><span>· Fuse</span></footer>`;
}

function signInView() {
  return html`<div class="hero" style="max-width:640px">
    <p class="label">Fuse · hardware log</p>
    <h1 class="pair">Build small. <b class="grad-text">Prove everything.</b></h1>
    <p class="sub">Sign in once on each device. After that it opens with no signal and syncs on its own.</p>
    <div class="row" style="margin-top:24px"><button class="btn hot" data-act="signin">Sign in with Google</button></div>
    ${db.info.sdkError ? html`<p class="banner bad" style="margin-top:24px">The sync library did not load: ${db.info.sdkError}. Connect to the internet once so it can be cached.</p>` : ""}
  </div>${signature()}`;
}

// ---------- theme ----------
function applyTheme(dark) {
  const t = store.settings().theme || "auto";
  const root = document.documentElement;
  if (dark) root.dataset.theme = "dark";
  else if (t === "auto") delete root.dataset.theme;
  else root.dataset.theme = t;
  document.body.classList.toggle("stage-home", !!dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", getComputedStyle(document.body).backgroundColor);
}

// ---------- render ----------
let shellBuilt = false, lastRouteKey = "";
export function render() {
  const r = route();
  const screen = SCREENS[r.name] || home;
  const app = document.getElementById("app");
  if (!shellBuilt || r.name + r.id !== lastRouteKey) { app.innerHTML = String(shell()); shellBuilt = true; }
  else {
    for (const id of ["sync-slot", "sync-slot-s"]) { const el = document.getElementById(id); if (el) el.innerHTML = String(syncPill()); }
    const cur = (n) => r.name === n || (n === "projects" && r.name === "p");
    app.querySelectorAll(".nav a, .bottombar a").forEach((a) => { const n = a.getAttribute("href").slice(2); n && cur(n) ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"); });
    const lb = app.querySelector(".side .foot .mono");
    if (lb) lb.textContent = `Last backup: ${store.settings().lastBackupAt ? dateOf(store.settings().lastBackupAt) : "never"}`;
  }
  const key = r.name + r.id;
  const sameRoute = key === lastRouteKey;
  lastRouteKey = key;
  // fresh element each render so listeners added by screen mounts never pile up
  const old = $main();
  const main = old.cloneNode(false);
  // keep focus and caret across re-renders
  const a = document.activeElement;
  const fkey = a && old.contains(a) ? (a.dataset.edit || a.dataset.k || a.id) : null;
  const sel = fkey && "selectionStart" in a ? [a.selectionStart, a.selectionEnd] : null;
  const scroll = sameRoute ? window.scrollY : 0;

  const dark = authState === "out" ? true : !!screen.dark;
  applyTheme(dark);
  const ctx = { ...r, go, render };
  let body;
  if (authState === "loading") body = html`<p class="muted">Opening your diary…</p>`;
  else if (authState === "out") body = signInView();
  else {
    try { body = html`${screen.render(ctx)}${signature()}`; }
    catch (e) { console.error(e); body = html`<div class="banner bad">This screen failed to draw: ${e.message}. Your data is safe. Try Home.</div>`; }
  }
  main.classList.toggle("ignite", r.name === "home" && firstHome && authState === "in");
  main.innerHTML = String(body);
  old.replaceWith(main);
  if (authState === "in") screen.mount?.(main, ctx);
  if (r.name === "home" && authState === "in" && store.all("projects", { archived: "any" }).length + store.all("parts").length) firstHome = false;
  if (fkey) {
    const el = main.querySelector(`[data-edit="${CSS.escape(fkey)}"],[data-k="${CSS.escape(fkey)}"],#${CSS.escape(fkey)}`);
    if (el) { el.focus({ preventScroll: true }); if (sel && "setSelectionRange" in el) try { el.setSelectionRange(...sel); } catch {} }
  }
  if (sameRoute) window.scrollTo(0, scroll);
  else { window.scrollTo(0, 0); }
  document.title = screen.title ? `${typeof screen.title === "function" ? screen.title(ctx) : screen.title} · Fuse` : "Fuse";
}

let queued = false;
const schedule = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; render(); }); };

// ---------- global events ----------
const GLOBAL_ACTS = {
  search: () => openSearch(),
  signin: async () => { try { await db.signIn(); } catch (e) { toast(`Sign-in failed: ${e.message}`); } },
  quick: () => quickSheet(),
  menu: () => menuSheet(),
  "export-backup": () => A.exportBackup().catch((e) => toast(`Export failed: ${e.message}`)),
};

function findAct(name) {
  const screen = SCREENS[route().name] || home;
  return screen.acts?.[name] || GLOBAL_ACTS[name];
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el || el.closest(".modal") && !el.closest("[data-modal-acts]")) return;
  const fn = findAct(el.dataset.act);
  if (fn) { if (el.tagName !== "INPUT") e.preventDefault(); fn(el, e); }
});

// Generic inline edit: data-edit="col.id.field" data-type="text|int|num|idr|tags|bool|null"
export function applyEdit(el) {
  const [col, id, field] = el.dataset.edit.split(".");
  const value = coerce(el);
  const cur = store.get(col, id);
  if (!cur || JSON.stringify(cur[field]) === JSON.stringify(value)) return;
  if (field === "name" && !value) { render(); return; }
  if (col === "parts" && field === "status") A.setPartStatus(id, value);
  else store.update(col, id, { [field]: value });
}
document.addEventListener("change", (e) => {
  const el = e.target.closest("[data-edit]");
  if (el) applyEdit(el);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.matches?.("input[data-edit]")) { e.preventDefault(); e.target.blur(); }
  if (e.key === "/" && !e.target.closest?.("input,textarea,select,[contenteditable]") && !document.querySelector(".modal-bg,.search-pop")) { e.preventDefault(); openSearch(); }
});

// ---------- search overlay ----------
export function openSearch(q = "") {
  if (document.querySelector(".search-pop")) return;
  const pop = document.createElement("div");
  pop.className = "search-pop";
  pop.innerHTML = `<div class="box" role="dialog" aria-label="Search"><label class="sr" for="sq">Search everything</label><input id="sq" placeholder="Search parts, entries, skills, projects. #tag for tags" autocomplete="off" value="${esc(q)}"><div class="res" role="listbox"></div></div>`;
  const input = pop.querySelector("input"), res = pop.querySelector(".res");
  let sel = 0, hits = [];
  const draw = () => {
    hits = search(input.value);
    sel = Math.min(sel, Math.max(0, hits.length - 1));
    res.innerHTML = input.value.trim()
      ? (hits.length ? hits.map((h, i) => `<a href="${esc(h.href)}" class="${i === sel ? "sel" : ""}" role="option"><span class="k">${esc(h.label)}</span><span>${esc(h.title)}${h.d.tags?.length ? ` <span class="tag">${esc(h.d.tags.map((t) => "#" + t).join(" "))}</span>` : ""}</span></a>`).join("") : `<p class="muted" style="padding:12px">Nothing matches.</p>`)
      : `<p class="muted" style="padding:12px">Type to search. Works offline.</p>`;
  };
  const close = () => pop.remove();
  input.addEventListener("input", () => { sel = 0; draw(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
    if (e.key === "ArrowDown") { sel = Math.min(sel + 1, hits.length - 1); draw(); e.preventDefault(); }
    if (e.key === "ArrowUp") { sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); }
    if (e.key === "Enter" && hits[sel]) { close(); go(hits[sel].href); }
  });
  pop.addEventListener("click", (e) => { if (e.target === pop) close(); if (e.target.closest("a")) close(); });
  document.body.append(pop);
  draw();
  input.focus();
}

// ---------- sheets ----------
export const TYPES = [["build", "Build"], ["fail", "Fail"], ["decision", "Decision"], ["experiment", "Experiment"], ["purchase", "Purchase"], ["reflect", "Reflect"]];
function quickSheet() {
  modal(String(html`<div class="modal-h"><h2>Log an entry</h2><button class="btn icon ghost" data-close aria-label="Close">${icon("x")}</button></div>
    <div class="quick">${TYPES.map(([t, l]) => html`<a href="#/entry/new?type=${t}" class="ty-${t}" data-close>${icon(t)}${l}</a>`)}</div>`), { label: "Log an entry" });
}
function menuSheet() {
  modal(String(html`<div class="modal-h"><h2>Menu</h2><button class="btn icon ghost" data-close aria-label="Close">${icon("x")}</button></div>
    <nav class="nav stack s">${NAV.map(([n, l, i]) => html`<a href="#/${n}" data-close>${icon(i)}${l}</a>`)}</nav>`), { label: "Menu" });
}

// ---------- boot ----------
let peakTimer;
store.onChange(() => {
  schedule();
  clearTimeout(peakTimer);
  peakTimer = setTimeout(() => { if (authState === "in") A.reconcilePeaks(); }, 1500);
});
addEventListener("hashchange", render);

async function boot() {
  render();
  await db.init({
    onDocs: store.applyDocs,
    onStatus: store.setStatus,
    onReset: store.reset,
    onAuth: (user) => { authState = user ? "in" : "out"; render(); },
  });
  if ("serviceWorker" in navigator && location.protocol !== "file:" && !new URLSearchParams(location.search).has("nosw")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}
boot();
window.__fuse = { store, A, db }; // console access for debugging and tests
