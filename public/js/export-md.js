// Markdown renderer for the export document model. Plain text that reads well on its own.
import { provenanceLine } from "./export.js";

const q = (s) => `"${String(s ?? "").replace(/"/g, '\\"')}"`;
const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const table = (head, rows) => [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`)];

export function renderMarkdown(doc) {
  if (!doc) return "";
  const m = doc.meta;
  const o = ["---", `title: ${q(m.title)}`, `track: ${q(m.track)}`, `exported: ${m.exported}`, `entries: ${m.entries}`, `first_entry: ${m.first_entry || ""}`, `last_entry: ${m.last_entry || ""}`];
  if (m.budget_cap_idr != null) o.push(`budget_cap_idr: ${m.budget_cap_idr}`);
  if (m.spent_idr != null) o.push(`spent_idr: ${m.spent_idr}`);
  o.push(`success_measure: ${q(m.success_measure)}`, `result: ${q(m.result)}`, `skills: [${m.skills.map((s) => `{name: ${q(s.name)}, level: ${s.level}, proofs: ${s.proofs}}`).join(", ")}]`, `variant: ${m.variant}`, "---", "", `# ${m.title}`, "", "## At a glance", "");
  const g = doc.glance;
  if (g.problem) o.push(g.problem, "");
  if (g.result) o.push(`Result: **${g.result.value} ${g.result.unit}** against "${g.measure}": ${g.result.verdict}.`.replace("  ", " "), "");
  else if (g.measure) o.push(`Success measure: ${g.measure}. Not tested yet.`, "");
  if (g.skills.length) o.push(`Skills: ${g.skills.map((s) => `${s.name} (level ${s.level}, ${s.proofs} proof${s.proofs === 1 ? "" : "s"})`).join(", ")}.`, "");
  if (g.cost) o.push(`Cost: ${g.cost}.`, "");
  o.push(`Dates: ${g.dates.first || "none"} to ${g.dates.last || "none"}.`, "");

  doc.chapters.forEach((c, i) => {
    o.push(`## ${i + 1}. ${c.title}`, "");
    if (!c.blocks.length) o.push("Nothing recorded for this part yet.", "");
    for (const b of c.blocks) {
      if (b.type === "h") o.push(`### ${b.text}`, "");
      if (b.type === "p") o.push(`${b.date ? `${b.date}. ` : ""}${b.lead ? `**${b.lead}.** ` : ""}${b.text}`.trim(), "");
      if (b.type === "equation") o.push("```", b.text, "```", "");
      if (b.type === "figure") o.push(`![Figure ${b.n}. ${b.caption}](${b.path})`, "");
      if (b.type === "table") o.push(...table(b.head, b.rows), "");
      if (b.type === "result") o.push(`Result: **${b.value} ${b.unit}**. ${b.verdict}.${b.note ? ` ${b.note}` : ""}`.replace("  ", " "), "");
      if (b.type === "decision") {
        o.push(`### ${b.date} ${b.title}`, "");
        if (b.context) o.push(b.context, "");
        if (b.options.length) o.push("Options considered:", "", ...b.options.map((x) => `- ${x}`), "");
        o.push(`Choice: ${b.choice}.${b.why ? ` ${b.why}` : ""}`, "");
        if (b.changeMyMind) o.push(`> What would change my mind: ${b.changeMyMind}`, "");
      }
    }
  });
  const a = doc.appendix;
  if (a.fails.length) o.push("## Appendix A. What broke", "", ...table(["Date", "Title", "Symptom", "Cause", "Fix"], a.fails.map((f) => [f.date, f.title, f.symptom, f.cause, f.fix])), "");
  if (a.parts.length) o.push("## Appendix B. Parts", "", ...(a.parts[0].price !== undefined ? table(["Date", "Part", "Qty", "Unit price", "Shop"], a.parts.map((x) => [x.date, x.name, x.qty, x.price, x.shop])) : table(["Part", "Qty"], a.parts.map((x) => [x.name, x.qty]))), "");
  if (a.references.length) o.push("## Appendix C. References", "", ...a.references.map((r) => `- ${r.title} (${r.type})${r.url ? ` ${r.url}` : ""}${r.note ? `. ${r.note}` : ""}`), "");
  if (a.files.length) o.push("## Files", "", ...a.files.map((f) => `- ${f.name}${f.caption ? `: ${f.caption}` : ""}`), "");
  if (a.log.length) o.push("## Full build log", "", ...a.log.map((e) => `- ${e.date} ${e.type}: ${e.title || "(untitled)"}${e.proofs ? ` (${e.proofs} proof${e.proofs === 1 ? "" : "s"})` : ""}`), "");
  if (a.parked.length) o.push("## Parked thoughts", "", ...a.parked.map((x) => `- ${x.date} ${x.text}`), "");
  o.push("---", "", provenanceLine(doc.provenance), "");
  return o.join("\n");
}
