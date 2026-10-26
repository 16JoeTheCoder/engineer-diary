// fuse.project/1 importer: parse an AI reply, validate it, clean it, match it to inventory.
// Plain code, no network, no DOM. Imported text is data only: it is never executed or rendered as HTML.

export const SCHEMA = "fuse.project/1";
export const STAGES = ["plan", "order", "build", "test", "document"];
export const PROOFS = ["photo", "measurement", "snippet", "note"];
export const RESOURCE_TYPES = ["video", "course", "datasheet", "article", "tool"];
export const LIMITS = { bytes: 200 * 1024, parts: 60, tasks: 80, text: 500, detail: 1500, tag: 24 };

const KNOWN = {
  root: ["schema", "project", "parts", "tasks", "skills", "resources", "risks"],
  project: ["name", "track", "summary", "budgetCapIdr", "aims", "nextAction"],
  part: ["ref", "name", "category", "qty", "priceIdr", "searchQuery", "purpose", "owned", "tags"],
  task: ["ref", "stage", "title", "detail", "estMinutes", "partRefs", "skills", "proof", "dependsOn", "done"],
  skill: ["name", "domain", "why"],
  resource: ["title", "type", "note", "url"],
  risk: ["text", "mitigation"],
};

// Skill name aliases (normalized form -> normalized canonical form).
export const SKILL_ALIASES = {
  "datasheets": "reading datasheets",
  "datasheet reading": "reading datasheets",
  "solder": "soldering",
  "soldering basics": "soldering",
  "through hole soldering": "soldering",
  "multimeter": "using a multimeter",
  "multimeter use": "using a multimeter",
  "measuring with a multimeter": "using a multimeter",
  "motor driver": "motor drivers",
  "pwm": "pwm motor control",
  "pwm control": "pwm motor control",
  "arduino": "arduino programming",
  "esp32": "esp32 programming",
  "micropython": "micropython programming",
  "pid": "pid control",
  "pid tuning": "pid control",
  "ultrasonic sensor": "ultrasonic ranging",
  "ultrasonic sensors": "ultrasonic ranging",
  "wiring": "breadboard wiring",
  "breadboarding": "breadboard wiring",
  "3d printing": "3d printing",
  "cad": "cad modelling",
};

export const normName = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const skillKey = (s) => { const n = normName(s); return SKILL_ALIASES[n] || n; };

// ---------- parsing ----------
function lineCol(text, pos) {
  const before = text.slice(0, pos).split("\n");
  return { line: before.length, column: before[before.length - 1].length + 1 };
}

// Remove trailing commas before } or ], ignoring commas inside strings.
function stripTrailingCommas(s) {
  let out = "", inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      out += c;
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === ",") {
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j])) j++;
      if (s[j] === "}" || s[j] === "]") { out += " "; continue; } // keep positions stable
    }
    out += c;
  }
  return out;
}

// Find where JSON breaks when the engine's message has no position. Minimal recursive descent.
function errorPos(s) {
  let i = 0;
  const ws = () => { while (/\s/.test(s[i] || "")) i++; };
  const fail = () => { throw i; };
  const str = () => { i++; while (i < s.length && s[i] !== '"') { if (s[i] === "\\") i++; i++; } if (s[i] !== '"') fail(); i++; };
  const value = () => {
    ws();
    const c = s[i];
    if (c === "{") { i++; ws(); if (s[i] === "}") { i++; return; } for (;;) { ws(); if (s[i] !== '"') fail(); str(); ws(); if (s[i] !== ":") fail(); i++; value(); ws(); if (s[i] === ",") { i++; continue; } if (s[i] === "}") { i++; return; } fail(); } }
    if (c === "[") { i++; ws(); if (s[i] === "]") { i++; return; } for (;;) { value(); ws(); if (s[i] === ",") { i++; continue; } if (s[i] === "]") { i++; return; } fail(); } }
    if (c === '"') return str();
    const m = /^(-?\d+(\.\d+)?([eE][+-]?\d+)?|true|false|null)/.exec(s.slice(i, i + 40));
    if (!m) fail();
    i += m[0].length;
  };
  try { value(); ws(); return i < s.length ? i : null; } catch (p) { return typeof p === "number" ? p : null; }
}

export function parse(text) {
  if (typeof text !== "string" || !text.trim()) return { error: { path: "(file)", msg: "The paste is empty. Paste the AI reply or drop a .json file." } };
  if (text.length > LIMITS.bytes) return { error: { path: "(file)", msg: `The file is ${Math.round(text.length / 1024)} KB. The limit is 200 KB.` } };
  const src = text.replace(/^﻿/, "");
  const start = src.indexOf("{"), end = src.lastIndexOf("}");
  if (start < 0 || end <= start) return { error: { path: "(file)", msg: "No JSON object found. The reply must contain one { ... } object." } };
  const body = stripTrailingCommas(src.slice(start, end + 1));
  try {
    return { value: JSON.parse(body) };
  } catch (e) {
    const m = /position (\d+)/.exec(e.message);
    const at = m ? +m[1] : errorPos(body);
    const lc = at != null ? lineCol(src, start + at) : null;
    return { error: { path: "(file)", msg: `Not valid JSON${lc ? ` at line ${lc.line}, column ${lc.column}` : ""}: ${e.message.replace(/ in JSON.*$/, "")}.` } };
  }
}

// ---------- cleaning ----------
const stripTags = (s) => s.replace(/<[^>]*>/g, "").replace(/[<>]/g, "");
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

function looksUnusualUrl(u) {
  try {
    const x = new URL(u);
    if (x.protocol !== "https:") return true;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(x.hostname) || x.username || x.password) return true;
    if (u.length > 300 || /xn--/.test(x.hostname)) return true;
    return false;
  } catch { return true; }
}

// ---------- validation ----------
// ctx: { parts: [{id,name,status,qty,archived}], skills: [{id,name}] } for matching. Optional.
export function validate(input, ctx = {}) {
  const errors = [], warnings = [];
  const err = (path, msg) => errors.push({ path, msg });
  const warn = (path, msg, extra) => warnings.push({ path, msg, ...extra });

  const text = (v, path, { required = false, max = LIMITS.text } = {}) => {
    if (v == null || v === "") { if (required) err(path, "is required."); return ""; }
    if (typeof v === "number" || typeof v === "boolean") v = String(v);
    if (typeof v !== "string") { err(path, "must be text."); return ""; }
    const t = stripTags(v).trim();
    if (!t && required) err(path, "is required.");
    if (t.length > max) err(path, `is ${t.length} characters. The limit is ${max}.`);
    return t;
  };
  const list = (v, path) => {
    if (v == null) return [];
    if (!Array.isArray(v)) { err(path, "must be a list."); return []; }
    return v;
  };
  const strList = (v, path) => list(v, path).map((x, i) => text(x, `${path}[${i}]`)).filter(Boolean);
  const unknown = (obj, keys, path) => {
    for (const k of Object.keys(obj)) if (!keys.includes(k)) warn(`${path ? path + "." : ""}${k}`, "is not part of fuse.project/1 and will be ignored.");
  };
  const money = (v, path) => {
    if (v == null || v === "") return null;
    const n = typeof v === "string" ? Number(v.replace(/[^\d.]/g, "")) : v;
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) { err(path, `"${v}" is not a price. Use whole rupiah or null.`); return null; }
    return Math.round(n);
  };

  if (!isObj(input)) { err("(file)", "The top level must be one JSON object."); return { errors, warnings, plan: null }; }
  unknown(input, KNOWN.root, "");

  // schema
  const schema = input.schema;
  const sm = /^fuse\.project\/(\d+)(?:\.\d+)?$/.exec(typeof schema === "string" ? schema.trim() : "");
  if (schema == null) err("schema", `is required. Use "${SCHEMA}".`);
  else if (!sm) err("schema", `"${schema}" is not a fuse.project schema. Use "${SCHEMA}".`);
  else if (sm[1] !== "1") err("schema", `version ${sm[1]} is not supported. Use "${SCHEMA}".`);

  // project
  const pj = isObj(input.project) ? input.project : (input.project == null ? (err("project", "is required."), {}) : (err("project", "must be an object."), {}));
  unknown(pj, KNOWN.project, "project");
  const project = {
    name: text(pj.name, "project.name", { required: true }),
    track: text(pj.track, "project.track") || "Robotics",
    summary: text(pj.summary, "project.summary"),
    budgetCapIdr: money(pj.budgetCapIdr, "project.budgetCapIdr"),
    aims: strList(pj.aims, "project.aims"),
    nextAction: text(pj.nextAction, "project.nextAction"),
  };

  // parts
  const rawParts = list(input.parts, "parts");
  if (rawParts.length > LIMITS.parts) err("parts", `has ${rawParts.length} parts. The limit is ${LIMITS.parts}.`);
  const refs = new Map(); // ref -> "parts" | "tasks"
  const seeRef = (ref, path, kind) => {
    if (!ref) return;
    if (refs.has(ref)) err(path, `"${ref}" is used more than once. Every ref must be unique.`);
    else refs.set(ref, kind);
  };
  const parts = rawParts.slice(0, LIMITS.parts).map((p, i) => {
    const path = `parts[${i}]`;
    if (!isObj(p)) { err(path, "must be an object."); return null; }
    unknown(p, KNOWN.part, path);
    const ref = text(p.ref, `${path}.ref`, { max: 40 }) || `p_auto${i + 1}`;
    seeRef(ref, `${path}.ref`, "parts");
    let qty = p.qty;
    if (qty == null) err(`${path}.qty`, "is required. Use a whole number of 1 or more.");
    else if (typeof qty === "string" && /^\d+$/.test(qty.trim())) qty = +qty;
    if (qty != null && (!Number.isInteger(qty) || qty < 1)) err(`${path}.qty`, `"${p.qty}" is not allowed. Use a whole number of 1 or more.`);
    const priceIdr = money(p.priceIdr, `${path}.priceIdr`);
    const owned = p.owned === true || p.owned === "true";
    if (priceIdr == null && !owned) warn(`${path}.priceIdr`, "has no price. It will show as unpriced.");
    return {
      ref, name: text(p.name, `${path}.name`, { required: true }), category: text(p.category, `${path}.category`),
      qty: Number.isInteger(qty) && qty >= 1 ? qty : 1, priceIdr, searchQuery: text(p.searchQuery, `${path}.searchQuery`),
      purpose: text(p.purpose, `${path}.purpose`), owned,
      tags: strList(p.tags, `${path}.tags`).map((t) => t.slice(0, LIMITS.tag)),
    };
  }).filter(Boolean);

  // tasks
  const rawTasks = list(input.tasks, "tasks");
  if (rawTasks.length > LIMITS.tasks) err("tasks", `has ${rawTasks.length} tasks. The limit is ${LIMITS.tasks}.`);
  const tasks = rawTasks.slice(0, LIMITS.tasks).map((t, i) => {
    const path = `tasks[${i}]`;
    if (!isObj(t)) { err(path, "must be an object."); return null; }
    unknown(t, KNOWN.task, path);
    const ref = text(t.ref, `${path}.ref`, { max: 40 }) || `t_auto${i + 1}`;
    seeRef(ref, `${path}.ref`, "tasks");
    const stage = typeof t.stage === "string" ? t.stage.trim().toLowerCase() : t.stage;
    if (stage == null || stage === "") err(`${path}.stage`, `is required. Use one of ${STAGES.join(", ")}.`);
    else if (!STAGES.includes(stage)) err(`${path}.stage`, `"${t.stage}" is not allowed. Use one of ${STAGES.join(", ")}.`);
    let est = t.estMinutes == null || t.estMinutes === "" ? null : Number(t.estMinutes);
    if (est != null) {
      if (!Number.isFinite(est)) { err(`${path}.estMinutes`, `"${t.estMinutes}" is not a number of minutes.`); est = null; }
      else if (est < 5 || est > 240) { warn(`${path}.estMinutes`, `${est} is outside 5 to 240 minutes and was clamped.`); est = Math.min(240, Math.max(5, Math.round(est))); }
      else est = Math.round(est);
    }
    const proof = list(t.proof, `${path}.proof`).map((x, j) => {
      const v = typeof x === "string" ? x.trim().toLowerCase() : x;
      if (!PROOFS.includes(v)) { err(`${path}.proof[${j}]`, `"${x}" is not allowed. Use any of ${PROOFS.join(", ")}.`); return null; }
      return v;
    }).filter(Boolean);
    return {
      ref, stage: STAGES.includes(stage) ? stage : "plan",
      title: text(t.title, `${path}.title`, { required: true }), detail: text(t.detail, `${path}.detail`, { max: LIMITS.detail }),
      estMinutes: est, partRefs: strList(t.partRefs, `${path}.partRefs`), skills: strList(t.skills, `${path}.skills`),
      proof: [...new Set(proof)], dependsOn: strList(t.dependsOn, `${path}.dependsOn`), done: t.done === true,
    };
  }).filter(Boolean);

  // references
  tasks.forEach((t, i) => {
    t.partRefs.forEach((r, j) => { if (refs.get(r) !== "parts") err(`tasks[${i}].partRefs[${j}]`, `"${r}" does not exist.`); });
    t.dependsOn.forEach((r, j) => {
      if (refs.get(r) !== "tasks") err(`tasks[${i}].dependsOn[${j}]`, `"${r}" does not exist.`);
      else if (r === t.ref) err(`tasks[${i}].dependsOn[${j}]`, "a task cannot depend on itself.");
    });
  });
  // dependency loop (DFS)
  const byRef = new Map(tasks.map((t, i) => [t.ref, i]));
  const color = new Map();
  let loopReported = false;
  const visit = (ref, trail) => {
    if (loopReported) return;
    color.set(ref, 1);
    const i = byRef.get(ref);
    for (const dep of tasks[i].dependsOn) {
      if (!byRef.has(dep) || dep === ref) continue;
      if (color.get(dep) === 1) {
        loopReported = true;
        const cyc = [...trail.slice(trail.indexOf(dep)), dep];
        err(`tasks[${i}].dependsOn`, `forms a dependency loop: ${cyc.join(" -> ")}.`);
        return;
      }
      if (!color.get(dep)) visit(dep, [...trail, dep]);
    }
    color.set(ref, 2);
  };
  for (const t of tasks) if (!color.get(t.ref)) visit(t.ref, [t.ref]);

  // skills, resources, risks
  const skills = list(input.skills, "skills").map((s, i) => {
    const path = `skills[${i}]`;
    if (typeof s === "string") s = { name: s };
    if (!isObj(s)) { err(path, "must be an object."); return null; }
    unknown(s, KNOWN.skill, path);
    return { name: text(s.name, `${path}.name`, { required: true }), domain: text(s.domain, `${path}.domain`), why: text(s.why, `${path}.why`) };
  }).filter((s) => s && s.name);
  const resources = list(input.resources, "resources").map((r, i) => {
    const path = `resources[${i}]`;
    if (!isObj(r)) { err(path, "must be an object."); return null; }
    unknown(r, KNOWN.resource, path);
    const type = typeof r.type === "string" ? r.type.trim().toLowerCase() : r.type;
    if (type != null && type !== "" && !RESOURCE_TYPES.includes(type)) err(`${path}.type`, `"${r.type}" is not allowed. Use one of ${RESOURCE_TYPES.join(", ")}.`);
    const url = text(r.url, `${path}.url`);
    if (url && looksUnusualUrl(url)) warn(`${path}.url`, "looks unusual. Check it before you open it.");
    return { title: text(r.title, `${path}.title`, { required: true }), type: RESOURCE_TYPES.includes(type) ? type : "article", note: text(r.note, `${path}.note`), url };
  }).filter(Boolean);
  const risks = list(input.risks, "risks").map((r, i) => {
    const path = `risks[${i}]`;
    if (typeof r === "string") r = { text: r };
    if (!isObj(r)) { err(path, "must be an object."); return null; }
    unknown(r, KNOWN.risk, path);
    return { text: text(r.text, `${path}.text`, { required: true }), mitigation: text(r.mitigation, `${path}.mitigation`) };
  }).filter(Boolean);

  // plan-level warnings
  if (tasks.length && !tasks.some((t) => t.stage === "test")) warn("tasks", "has no test task. Add one so you know it works.");
  if (tasks.length && !tasks.some((t) => t.stage === "document")) warn("tasks", "has no document task. Add one so the report has material.");
  const planned = parts.reduce((n, p) => n + (p.owned ? 0 : (p.priceIdr || 0) * p.qty), 0);
  if (project.budgetCapIdr && planned > project.budgetCapIdr)
    warn("project.budgetCapIdr", `The parts add up to Rp ${planned.toLocaleString("id-ID")}, over the cap of Rp ${project.budgetCapIdr.toLocaleString("id-ID")}.`);

  // matching (suggestions only, nothing merges silently)
  const inv = (ctx.parts || []).filter((p) => !p.archived);
  parts.forEach((p, i) => {
    const key = normName(p.name);
    const hits = inv.filter((x) => normName(x.name) === key);
    const ownedHit = hits.find((x) => x.status !== "lost" && x.status !== "retired" && x.status !== "wishlist");
    const lostHit = hits.find((x) => x.status === "lost");
    if (ownedHit) { p.match = { partId: ownedHit.id, qty: ownedHit.qty, status: ownedHit.status }; warn(`parts[${i}].name`, `You own ${ownedHit.qty} of these (${ownedHit.status.replace("_", " ")}).`, { kind: "owned" }); }
    else if (lostHit) { p.lostMatch = { partId: lostHit.id }; warn(`parts[${i}].name`, "You marked one of these lost. Look for it before buying.", { kind: "lost" }); }
  });
  const invSkills = (ctx.skills || []).filter((s) => !s.archived);
  const matchSkill = (name) => {
    const n = normName(name), k = skillKey(name);
    return invSkills.find((s) => normName(s.name) === n) || invSkills.find((s) => skillKey(s.name) === k) || null;
  };
  const skillNames = new Map();
  for (const s of skills) skillNames.set(skillKey(s.name), s);
  for (const t of tasks) for (const n of t.skills) if (!skillNames.has(skillKey(n))) skillNames.set(skillKey(n), { name: n, domain: "", why: "" });
  const allSkills = [...skillNames.values()].map((s) => { const m = matchSkill(s.name); return m ? { ...s, matchId: m.id, matchName: m.name } : s; });

  const plan = errors.length ? null : { schema: SCHEMA, project, parts, tasks, skills: allSkills, resources, risks };
  return { errors, warnings, plan };
}

export function check(text, ctx) {
  const p = parse(text);
  if (p.error) return { errors: [p.error], warnings: [], plan: null };
  return validate(p.value, ctx);
}

export function fixRequest(errors) {
  const lines = errors.slice(0, 10).map((e) => `- ${e.path}: ${e.msg}`);
  if (errors.length > 10) lines.push(`- and ${errors.length - 10} more problems of the same kind.`);
  return `Your JSON could not be imported. Fix only these problems and send back the complete corrected JSON, with nothing else.\n\n${lines.join("\n")}\n\nKeep every other part of the plan as it was.`;
}
