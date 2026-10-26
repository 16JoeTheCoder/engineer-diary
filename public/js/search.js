// Client-side full-text search over every text field. Prefix match per word, all words must hit.
// "#tag" matches tags only. Rebuilt lazily after any change; instant at personal scale.
import * as store from "./store.js";
import { norm } from "./util.js";

let index = null;
store.onChange(() => { index = null; });

const flat = (v) => (v == null ? "" : typeof v === "object" ? Object.values(v).map(flat).join(" ") : String(v));

const SOURCES = {
  parts: { label: "Part", title: (d) => d.name, text: (d) => [d.category, d.status, d.searchQuery, d.purpose, flat(d.links?.map((l) => l.shop))], href: (d) => `#/parts?open=${d.id}` },
  entries: { label: "Entry", title: (d) => d.title || d.type, text: (d) => [d.type, d.bodyMd, flat(d.fields)], href: (d) => `#/entry/${d.id}` },
  skills: { label: "Skill", title: (d) => d.name, text: (d) => [d.why], href: (d) => `#/skills?s=${d.id}` },
  projects: { label: "Project", title: (d) => d.name, text: (d) => [d.summary, flat(d.aims?.map((a) => a.text + " " + (a.reflection || ""))), flat(d.risks)], href: (d) => `#/p/${d.id}` },
  tasks: { label: "Task", title: (d) => d.title, text: (d) => [d.detail, d.stage], href: (d) => `#/p/${d.projectId}` },
  resources: { label: "Resource", title: (d) => d.title, text: (d) => [d.type, d.note, d.url], href: () => `#/library` },
  evidence: { label: "Evidence", title: (d) => d.caption || d.text?.slice(0, 60) || d.kind, text: (d) => [d.kind, d.text, d.value, d.unit], href: (d) => `#/entry/${d.entryId}` },
};

function build() {
  const docs = [];
  for (const [col, src] of Object.entries(SOURCES)) {
    for (const d of store.all(col)) {
      const title = src.title(d) || "";
      const words = new Set(norm([title, ...src.text(d)].join(" ")).split(" ").filter(Boolean));
      docs.push({ col, d, title, label: src.label, href: src.href(d), words: [...words], titleWords: norm(title).split(" "), tags: (d.tags || []).map((t) => t.toLowerCase()) });
    }
  }
  return docs;
}

export function search(q, limit = 30) {
  const raw = String(q || "").trim();
  if (!raw) return [];
  index ||= build();
  const tags = (raw.match(/#[^\s#]+/g) || []).map((t) => t.slice(1).toLowerCase());
  const terms = norm(raw.replace(/#[^\s#]+/g, " ")).split(" ").filter(Boolean);
  const out = [];
  for (const r of index) {
    if (tags.length && !tags.every((t) => r.tags.some((x) => x.startsWith(t)))) continue;
    let score = 0, ok = true;
    for (const t of terms) {
      const hit = r.words.some((w) => w.startsWith(t)) || r.tags.some((x) => x.startsWith(t));
      if (!hit) { ok = false; break; }
      score += r.titleWords.some((w) => w.startsWith(t)) ? 3 : 1;
    }
    if (ok) out.push({ ...r, score: score + (r.col === "parts" || r.col === "skills" ? 0.5 : 0) });
  }
  return out.sort((a, b) => b.score - a.score || String(b.d.updatedAt).localeCompare(String(a.d.updatedAt))).slice(0, limit);
}
