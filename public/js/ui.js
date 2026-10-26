// Icons (Lucide, 2px stroke), toasts with undo, modals.
import { html, raw, esc } from "./util.js";

const P = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5Z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  zap: '<path d="M13 2 3 14h8l-1 8 10-12h-8Z"/>',
  book: '<path d="M4 19.5V5a2 2 0 0 1 2-2h14v16H6.5A2.5 2.5 0 0 0 4 21.5Z"/><path d="M20 19v3H6.5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  archive: '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3Z"/><circle cx="12" cy="13" r="3.5"/>',
  ruler: '<path d="M21.3 15.3 8.7 2.7a1 1 0 0 0-1.4 0L2.7 7.3a1 1 0 0 0 0 1.4l12.6 12.6a1 1 0 0 0 1.4 0l4.6-4.6a1 1 0 0 0 0-1.4Z"/><path d="m7.5 10.5 2-2M10.5 13.5l2-2M13.5 16.5l2-2"/>',
  code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  build: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9Z"/>',
  fail: '<path d="M7.9 2h8.2L22 7.9v8.2L16.1 22H7.9L2 16.1V7.9Z"/><path d="m15 9-6 6M9 9l6 6"/>',
  decision: '<circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><circle cx="6" cy="18" r="3"/><path d="M6 9v6M18 15V9a3 3 0 0 0-3-3H9"/>',
  experiment: '<path d="M9 3h6M10 3v6.5L4.5 19A1.5 1.5 0 0 0 5.8 21h12.4a1.5 1.5 0 0 0 1.3-2L14 9.5V3"/><path d="M7 15h10"/>',
  purchase: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L22 8H6"/>',
  reflect: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/>',
  up: '<path d="m18 15-6-6-6 6"/>', down: '<path d="m6 9 6 6 6-6"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
  download: '<path d="M12 3v12m0 0-4-4m4 4 4-4M4 21h16"/>', upload: '<path d="M12 21V9m0 0-4 4m4-4 4 4M4 3h16"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6"/>',
  pin: '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/>',
  external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
};
export const icon = (name, cls = "ico") => raw(`<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ""}</svg>`);

// ---- toasts ----
let toastRoot;
export function toast(msg, { undo, action, actionLabel, ms = 10000 } = {}) {
  toastRoot ||= document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = "toast";
  el.setAttribute("role", "status");
  el.innerHTML = String(html`<span class="grow">${msg}</span>${action ? html`<button class="btn s" data-t="a">${actionLabel}</button>` : ""}${undo ? html`<button class="btn s" data-t="u">Undo</button>` : ""}<button class="btn s icon ghost" data-t="x" aria-label="Dismiss" style="color:inherit">${icon("x")}</button>`);
  const close = () => el.remove();
  el.addEventListener("click", (e) => {
    const t = e.target.closest("[data-t]")?.dataset.t;
    if (t === "u") { undo(); close(); toast("Undone.", { ms: 2500 }); }
    if (t === "a") { action(); close(); }
    if (t === "x") close();
  });
  toastRoot.append(el);
  while (toastRoot.children.length > 3) toastRoot.firstChild.remove();
  setTimeout(close, ms);
}

// ---- modal ----
// content: html string; onMount(root, close) wires events. Returns close().
export function modal(content, { wide = false, onMount, onClose, label = "Dialog" } = {}) {
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<div class="modal${wide ? " wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(label)}">${content}</div>`;
  const prev = document.activeElement;
  const close = () => { if (!bg.isConnected) return; bg.remove(); document.removeEventListener("keydown", onKey); onClose?.(); prev?.focus?.(); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  bg.addEventListener("mousedown", (e) => { if (e.target === bg) close(); });
  bg.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) close(); });
  document.addEventListener("keydown", onKey);
  document.body.append(bg);
  onMount?.(bg.querySelector(".modal"), close);
  (bg.querySelector("[autofocus]") || bg.querySelector("input,select,textarea,button"))?.focus();
  return close;
}

export const modalHead = (title) => html`<div class="modal-h"><h2>${title}</h2><button class="btn icon ghost" data-close aria-label="Close">${icon("x")}</button></div>`;

export function ask(title, fields, { submit = "Save", note = "" } = {}) {
  // fields: [{name, label, type, value, options, placeholder}]
  return new Promise((resolve) => {
    let done = false;
    const body = html`${modalHead(title)}<form class="stack" data-f>${note ? html`<p class="muted">${note}</p>` : ""}
      ${fields.map((f) => html`<label class="f"><span>${f.label}</span>${
        f.type === "select" ? html`<select class="in" name="${f.name}">${f.options.map((o) => html`<option value="${o.value}" ${o.value === f.value ? raw("selected") : ""}>${o.label}</option>`)}</select>`
        : f.type === "textarea" ? html`<textarea class="in" name="${f.name}" placeholder="${f.placeholder || ""}">${f.value ?? ""}</textarea>`
        : html`<input class="in" name="${f.name}" type="${f.type || "text"}" inputmode="${f.inputmode || ""}" value="${f.value ?? ""}" placeholder="${f.placeholder || ""}" ${f.list ? raw(`list="${esc(f.list)}"`) : ""}>`}</label>`)}
      <div class="row end"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary">${submit}</button></div></form>`;
    const close = modal(String(body), {
      label: title,
      onMount: (root, closeFn) => {
        root.querySelector("[data-f]").addEventListener("submit", (e) => {
          e.preventDefault();
          done = true;
          resolve(Object.fromEntries(new FormData(e.target)));
          closeFn();
        });
        new MutationObserver((_, obs) => { if (!root.isConnected) { obs.disconnect(); if (!done) resolve(null); } }).observe(document.body, { childList: true });
      },
    });
    void close;
  });
}
