// Export review: choose what goes in, then download Markdown, HTML, a print-ready page, or the full bundle.
import * as store from "../store.js";
import * as A from "../actions.js";
import * as db from "../db.js";
import { html, raw, download, b64FromBytes } from "../util.js";
import { icon, toast } from "../ui.js";
import { buildDocument, DEFAULTS, slug } from "../export.js";
import { renderMarkdown } from "../export-md.js";
import { renderHtml } from "../export-html.js";
import { zip } from "../zip.js";
import { buildBackup } from "../backup.js";

const TOGGLES = [["costs", "Include costs"], ["photos", "Include photos"], ["fails", "Include fails"], ["reflections", "Include reflections"], ["parked", "Include parked thoughts"], ["files", "Include files list"]];
const opts = { ...DEFAULTS };
const LIMIT = 25 * 1048576;

async function images(doc) {
  const out = {}, bytes = {};
  for (const f of doc.figures) {
    if (!f.blobId) continue;
    try { const b = await db.getBlob(f.blobId); if (b?.data) { const u8 = b.data instanceof Uint8Array ? b.data : new Uint8Array(b.data.toUint8Array ? b.data.toUint8Array() : b.data); bytes[f.path] = u8; out[f.path] = `data:image/jpeg;base64,${b64FromBytes(u8)}`; } } catch {}
  }
  return { out, bytes };
}

async function fontCss() {
  const faces = [["Space Grotesk", 300, "space-grotesk-latin-300-normal"], ["Space Grotesk", 400, "space-grotesk-latin-400-normal"], ["Space Grotesk", 700, "space-grotesk-latin-700-normal"], ["JetBrains Mono", 400, "jetbrains-mono-latin-400-normal"]];
  let css = "";
  for (const [fam, w, file] of faces) {
    try { const r = await fetch(`assets/fonts/${file}.woff2`); const u8 = new Uint8Array(await r.arrayBuffer()); css += `@font-face{font-family:"${fam}";font-weight:${w};src:url(data:font/woff2;base64,${b64FromBytes(u8)}) format("woff2");font-display:swap}`; } catch {}
  }
  return css;
}

export default {
  title: (ctx) => `Export · ${store.get("projects", ctx.id)?.name || ""}`,
  render(ctx) {
    const p = store.get("projects", ctx.id);
    if (!p) return html`<div class="empty">This project is not here.<a class="btn" href="#/projects">Open projects</a></div>`;
    const doc = buildDocument(A.data(), p.id, opts);
    const photoBytes = doc.figures.length * 300 * 1024;
    const words = renderMarkdown(doc).split(/\s+/).length;
    return html`<div class="page-h"><h1>Export ${p.name}</h1><a class="btn text" href="#/p/${p.id}">Back to the project</a></div>
    <div class="grid2">
      <section class="panel stack">
        <h3>What goes in</h3>
        ${TOGGLES.map(([k, l]) => html`<label class="check"><input type="checkbox" data-opt="${k}" ${opts[k] ? raw("checked") : ""}>${l}</label>`)}
        <div class="seg" role="group" aria-label="Variant"><button data-act="ex-variant" data-v="portfolio" aria-pressed="${opts.variant === "portfolio"}">Portfolio</button><button data-act="ex-variant" data-v="full" aria-pressed="${opts.variant === "full"}">Full context</button></div>
        <p class="muted">${opts.variant === "full" ? "Full context adds the dated build log, every fail, costs per purchase and parked thoughts: the file you paste into any AI yourself." : "Portfolio is the clean case study for a reader."}</p>
      </section>
      <section class="panel stack">
        <h3>What you get</h3>
        <p><span class="mono">${doc.meta.entries}</span> dated entries · <span class="mono">${doc.figures.length}</span> figures · about <span class="mono">${words}</span> words</p>
        ${photoBytes > LIMIT ? html`<p class="banner warn"><span class="st warn">The HTML may be over 25 MB with ${doc.figures.length} photos. Turn photos off or use the bundle.</span></p>` : ""}
        ${doc.glance.problem ? "" : html`<p class="st warn">No problem statement yet. Add it in Flowstate station 1 so page 1 says what this is.</p>`}
        <div class="stack s">
          <button class="btn primary" data-act="ex-md">${icon("download")}Download Markdown</button>
          <button class="btn" data-act="ex-html">${icon("download")}Download HTML</button>
          <button class="btn" data-act="ex-print">${icon("file")}Print or save as PDF</button>
          <button class="btn" data-act="ex-zip">${icon("download")}Download bundle (.zip)</button>
        </div>
        <p class="muted">Fuse assembles your own words. It never rewrites them, and it calls no AI.</p>
      </section>
    </div>`;
  },
  mount(root) {
    root.querySelectorAll("[data-opt]").forEach((el) => el.addEventListener("change", () => { opts[el.dataset.opt] = el.checked; store.notify(); }));
  },
  acts: {
    "ex-variant": (el) => { opts.variant = el.dataset.v; if (opts.variant === "full") opts.parked = true; store.notify(); },
    "ex-md": () => { const { p, doc } = cur(); download(`${slug(p.name)}.md`, renderMarkdown(doc), "text/markdown"); },
    "ex-html": async () => { const { p, doc } = cur(); const { out } = await images(doc); download(`${slug(p.name)}.html`, renderHtml(doc, { images: out, fontCss: await fontCss() }), "text/html"); },
    "ex-print": async () => {
      const { doc } = cur();
      const w = window.open("", "_blank");
      if (!w) { toast("The browser blocked the new tab. Allow pop-ups for Fuse, then try again."); return; }
      const { out } = await images(doc);
      w.document.write(renderHtml(doc, { images: out, fontCss: await fontCss() }));
      w.document.close();
      setTimeout(() => w.print(), 600);
    },
    "ex-zip": async () => {
      const { p, doc } = cur();
      const { out, bytes } = await images(doc);
      const snap = store.snapshot();
      const keep = (col, fn) => (snap[col] || []).filter(fn);
      const entryIds = new Set(keep("entries", (e) => e.projectId === p.id).map((e) => e.id));
      const cols = { projects: keep("projects", (x) => x.id === p.id), entries: keep("entries", (e) => e.projectId === p.id), evidence: keep("evidence", (e) => entryIds.has(e.entryId)),
        tasks: keep("tasks", (t) => t.projectId === p.id), bomLines: keep("bomLines", (l) => l.projectId === p.id), purchases: keep("purchases", (x) => x.projectId === p.id), files: keep("files", (f) => f.projectId === p.id) };
      const data = buildBackup(cols, []);
      const files = [{ name: "project.md", data: renderMarkdown(doc) }, { name: "project.html", data: renderHtml(doc, { images: out, fontCss: await fontCss() }) }, { name: "data.json", data: JSON.stringify(data) },
        ...Object.entries(bytes).map(([path, u8]) => ({ name: path, data: u8 }))];
      download(`${slug(p.name)}-bundle.zip`, new Blob([zip(files)], { type: "application/zip" }));
    },
  },
};
const cur = () => { const id = location.hash.split("/")[2].split("?")[0]; const p = store.get("projects", id); return { p, doc: buildDocument(A.data(), id, opts) }; };
