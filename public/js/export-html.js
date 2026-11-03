// Self-contained HTML renderer: one file, light theme, print-ready. All user text is escaped.
import { esc } from "./util.js";
import { provenanceLine } from "./export.js";

const CSS = `
:root { --ink: #16171A; --muted: #4A4D53; --line: #D3D0C7; --paper: #FFFFFF; --accent: #B93A09; }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 400 17px/1.6 "Space Grotesk", system-ui, sans-serif; }
.mono, time, .eq, td.n, .fig-n, .result b { font-family: "JetBrains Mono", ui-monospace, Consolas, monospace; font-variant-numeric: tabular-nums; }
a { color: var(--accent); text-underline-offset: 3px; }
.skip { position: absolute; left: -9999px; } .skip:focus { left: 16px; top: 16px; background: var(--paper); padding: 8px; }
.wrap { max-width: 944px; margin: 0 auto; padding: 48px 24px 64px; }
header h1 { font: 700 clamp(32px, 5vw, 48px)/1.1 "Space Grotesk", system-ui, sans-serif; letter-spacing: -0.03em; margin: 0 0 12px; max-width: 22ch; }
header p { margin: 0; color: var(--muted); max-width: 64ch; }
.glance { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 24px 32px; margin: 48px 0 64px; padding: 24px 0; border-top: 2px solid var(--ink); border-bottom: 1px solid var(--line); }
.glance h2 { grid-column: 1 / -1; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; margin: 0; color: var(--muted); }
.glance .result b { font-size: 40px; line-height: 1.1; font-weight: 500; letter-spacing: -0.02em; }
.glance .verdict { display: inline-block; margin-left: 8px; font-weight: 700; }
.glance dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 4px 16px; }
.glance dt { color: var(--muted); } .glance dd { margin: 0; }
.glance figure { margin: 0; grid-row: span 2; }
.glance img { width: 100%; height: auto; display: block; border: 1px solid var(--line); }
section.ch { margin: 0 0 64px; display: grid; grid-template-columns: minmax(0, 640px) 280px; gap: 0 24px; align-items: start; }
section.ch > * { grid-column: 1; }
section.ch > figure { grid-column: 2; margin: 0 0 24px; }
h2.ch-t { font: 700 28px/1.2 "Space Grotesk", system-ui, sans-serif; letter-spacing: -0.02em; margin: 0 0 24px; }
h2.ch-t span { color: var(--muted); font-weight: 400; margin-right: 8px; }
h3 { font-size: 20px; line-height: 1.3; margin: 32px 0 8px; }
p { margin: 0 0 16px; max-width: 68ch; }
.lead { font-weight: 700; }
time { color: var(--muted); font-size: 15px; margin-right: 8px; }
figure img { width: 100%; height: auto; display: block; border: 1px solid var(--line); }
figcaption { font-size: 15px; color: var(--muted); margin-top: 8px; }
.fig-n { color: var(--accent); font-weight: 700; margin-right: 6px; }
pre.eq { font-size: 15px; padding: 12px 16px; border-left: 2px solid var(--line); margin: 0 0 16px; white-space: pre-wrap; }
blockquote { margin: 0 0 24px; padding: 8px 0 8px 24px; border-left: 2px solid var(--accent); font-size: 20px; line-height: 1.45; max-width: 52ch; }
ul.opts { margin: 0 0 16px; padding-left: 20px; }
table { border-collapse: collapse; width: 100%; margin: 0 0 24px; font-size: 15px; }
th, td { text-align: left; padding: 8px 12px 8px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); font-weight: 500; }
.result { font-size: 20px; }
footer { border-top: 1px solid var(--line); padding-top: 24px; color: var(--muted); font-size: 15px; display: grid; gap: 16px; }
.sig { font-weight: 300; letter-spacing: -0.01em; } .sig b { font-weight: 700; color: var(--ink); }
@media (max-width: 1099px) { section.ch { grid-template-columns: minmax(0, 1fr) 240px; } }
@media (max-width: 899px) { section.ch { grid-template-columns: minmax(0, 1fr); } section.ch > figure { grid-column: 1; } .glance { grid-template-columns: minmax(0, 1fr); } .wrap { padding: 32px 16px 48px; } }
@media print {
  @page { size: A4; margin: 18mm; }
  body { font-size: 11pt; line-height: 1.5; background: none; }
  .wrap { max-width: none; padding: 0; }
  .glance { break-after: page; border-top-width: 1pt; }
  section.ch { display: block; margin-bottom: 24pt; }
  figure, blockquote, table, pre.eq { break-inside: avoid; }
  section.ch > figure { margin: 0 0 12pt; max-width: 60%; }
  h2, h3 { break-after: avoid; }
  a { color: var(--ink); }
  .skip { display: none; }
}`;

const fig = (b, img) => `<figure id="fig-${b.n}">${img ? `<img src="${img}" alt="${esc(b.alt)}" loading="lazy">` : ""}<figcaption><span class="fig-n">Figure ${b.n}.</span>${esc(b.caption)}</figcaption></figure>`;
const table = (head, rows) => `<table><thead><tr>${head.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${i && /^[\d.,\s]+$/.test(String(c)) ? ' class="n"' : ""}>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const linkFigs = (s) => esc(s).replace(/Figure (\d+)/g, '<a href="#fig-$1">Figure $1</a>');

export function renderHtml(doc, { images = {}, fontCss = "" } = {}) {
  if (!doc) return "";
  const m = doc.meta, g = doc.glance;
  const body = [];
  body.push(`<header><h1>${esc(m.title)}</h1>${g.problem ? `<p>${esc(g.problem)}</p>` : ""}</header>`);
  body.push(`<section class="glance" aria-labelledby="glance-h"><h2 id="glance-h">At a glance</h2>
    <div>${g.result ? `<p class="result"><b>${esc(g.result.value)}</b> ${esc(g.result.unit)}<span class="verdict">${g.result.verdict === "Met" ? "✓ Met" : g.result.verdict === "Not met" ? "✗ Not met" : esc(g.result.verdict)}</span></p>` : ""}
    ${g.measure ? `<p>Measured against: ${esc(g.measure)}</p>` : ""}
    <dl>${g.cost ? `<dt>Cost</dt><dd class="mono">${esc(g.cost)}</dd>` : ""}<dt>Dates</dt><dd><time>${esc(g.dates.first)}</time>to <time>${esc(g.dates.last)}</time></dd>
    ${g.skills.length ? `<dt>Skills</dt><dd>${g.skills.map((s) => `${esc(s.name)} <span class="mono">L${s.level}, ${s.proofs} proof${s.proofs === 1 ? "" : "s"}</span>`).join("<br>")}</dd>` : ""}</dl>
    <p style="margin-top:16px;font-size:15px;color:var(--muted)">${esc(provenanceLine(doc.provenance))}</p></div>
    ${g.hero && images[g.hero.path] ? `<figure><img src="${images[g.hero.path]}" alt="${esc(g.hero.alt)}"><figcaption><span class="fig-n">Figure ${g.hero.n}.</span>${esc(g.hero.caption)}</figcaption></figure>` : ""}
  </section>`);
  body.push('<main id="main">');
  doc.chapters.forEach((c, i) => {
    const parts = c.blocks.map((b) => {
      if (b.type === "h") return `<h3>${esc(b.text)}</h3>`;
      if (b.type === "p") return `<p>${b.date ? `<time>${esc(b.date)}</time>` : ""}${b.lead ? `<span class="lead">${esc(b.lead)}.</span> ` : ""}${linkFigs(b.text)}</p>`;
      if (b.type === "equation") return `<pre class="eq">${esc(b.text)}</pre>`;
      if (b.type === "figure") return fig(b, images[b.path]);
      if (b.type === "table") return table(b.head, b.rows);
      if (b.type === "result") return `<p class="result"><b>${esc(b.value)}</b> ${esc(b.unit)}: ${esc(b.verdict)}.${b.note ? ` ${esc(b.note)}` : ""}</p>`;
      if (b.type === "decision") return `<h3><time>${esc(b.date)}</time>${esc(b.title)}</h3>${b.context ? `<p>${esc(b.context)}</p>` : ""}${b.options.length ? `<ul class="opts">${b.options.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}<p><span class="lead">Choice: ${esc(b.choice)}.</span> ${linkFigs(b.why)}</p>${b.changeMyMind ? `<blockquote>What would change my mind: ${esc(b.changeMyMind)}</blockquote>` : ""}`;
      return "";
    }).join("\n");
    body.push(`<section class="ch" id="ch-${i + 1}" aria-labelledby="ch-${i + 1}-h"><h2 class="ch-t" id="ch-${i + 1}-h"><span>${i + 1}</span>${esc(c.title)}</h2>${parts || "<p>Nothing recorded for this part yet.</p>"}</section>`);
  });
  const a = doc.appendix;
  const app = [];
  if (a.fails.length) app.push(`<h3>Appendix A. What broke</h3>${table(["Date", "Title", "Symptom", "Cause", "Fix"], a.fails.map((f) => [f.date, f.title, f.symptom, f.cause, f.fix]))}`);
  if (a.parts.length) app.push(`<h3>Appendix B. Parts</h3>${a.parts[0].price !== undefined ? table(["Date", "Part", "Qty", "Unit price", "Shop"], a.parts.map((x) => [x.date, x.name, x.qty, x.price, x.shop])) : table(["Part", "Qty"], a.parts.map((x) => [x.name, x.qty]))}`);
  if (a.references.length) app.push(`<h3>Appendix C. References</h3><ul>${a.references.map((r) => `<li>${/^https?:\/\//.test(r.url) ? `<a href="${esc(r.url)}">${esc(r.title)}</a>` : esc(r.title)} (${esc(r.type)})${r.note ? `. ${esc(r.note)}` : ""}</li>`).join("")}</ul>`);
  if (a.files.length) app.push(`<h3>Files</h3><ul>${a.files.map((f) => `<li>${esc(f.name)}${f.caption ? `: ${esc(f.caption)}` : ""}</li>`).join("")}</ul>`);
  if (a.log.length) app.push(`<h3>Full build log</h3>${table(["Date", "Type", "Entry", "Proofs"], a.log.map((e) => [e.date, e.type, e.title, e.proofs]))}`);
  if (a.parked.length) app.push(`<h3>Parked thoughts</h3><ul>${a.parked.map((x) => `<li><time>${esc(x.date)}</time>${esc(x.text)}</li>`).join("")}</ul>`);
  if (app.length) body.push(`<section class="ch" id="appendix" aria-labelledby="app-h"><h2 class="ch-t" id="app-h">Appendix</h2>${app.join("\n")}</section>`);
  body.push("</main>");
  body.push(`<footer><p>${esc(provenanceLine(doc.provenance))}</p><p class="sig">builtby<b>josef</b></p></footer>`);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(m.title)}</title><meta name="description" content="${esc(g.problem)}">
<style>${fontCss}${CSS}</style></head>
<body><a class="skip" href="#main">Skip to the case study</a><div class="wrap">
${body.join("\n")}
</div></body></html>
`;
}
