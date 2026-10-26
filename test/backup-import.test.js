import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildBackup, migrate, mergePlan, decodeBlobs } from "../public/js/backup.js";
import { check } from "../public/import/validate.js";
import { planToRecords, undoRecords, projectToPlan } from "../public/import/commit.js";

let n = 0;
const mk = (col, f = {}) => ({ id: `${col}-${++n}`, createdAt: "2026-10-26T00:00:00Z", updatedAt: "2026-10-26T00:00:00Z", archived: false, ...f });
const toD = (list, d = {}) => { const o = structuredClone(d); for (const { col, doc } of list) { o[col] ||= []; const i = o[col].findIndex((x) => x.id === doc.id); i >= 0 ? (o[col][i] = doc) : o[col].push(doc); } return o; };

test("backup round trip keeps docs and photo bytes", () => {
  const cols = { entries: [{ id: "e1", updatedAt: "2026-10-01" }], parts: [{ id: "p1", updatedAt: "2026-10-01" }] };
  const bytes = new Uint8Array([255, 216, 1, 2, 3, 0, 9]);
  const file = JSON.parse(JSON.stringify(buildBackup(cols, [{ id: "b1", kind: "full", data: bytes }])));
  const m = migrate(file);
  const plan = mergePlan(m, {});
  assert.equal(plan.added, 2);
  assert.deepEqual([...decodeBlobs(m)[0].data], [...bytes]);
});

test("restore never overwrites a newer updatedAt", () => {
  const file = migrate(buildBackup({ parts: [{ id: "p1", name: "old", updatedAt: "2026-10-01" }, { id: "p2", name: "newer in file", updatedAt: "2026-10-09" }] }, []));
  const current = { parts: [{ id: "p1", name: "edited", updatedAt: "2026-10-05" }, { id: "p2", name: "stale", updatedAt: "2026-10-02" }] };
  const r = mergePlan(file, current);
  assert.equal(r.skipped, 1);
  assert.equal(r.updated, 1);
  assert.equal(r.list[0].doc.name, "newer in file");
});

test("a backup from a newer schema is refused", () => {
  assert.throws(() => migrate({ format: "fuse.backup", schemaVersion: 99 }), /newer version/);
  assert.throws(() => migrate({ hello: 1 }), /not a Fuse backup/);
});

test("import creates one batch, links owned parts, never touches other data, and undo archives it all", () => {
  const raw = readFileSync(new URL("../public/import/samples/rover.json", import.meta.url), "utf8");
  const d = {
    parts: [{ id: "mm", name: "Multimeter", status: "spare", qty: 1, projectId: null, statusLog: [] }],
    skills: [{ id: "rd", name: "Reading datasheets", domainId: "el" }],
    domains: [{ id: "el", name: "Electronics" }, { id: "em", name: "Embedded" }],
    tracks: [{ id: "rob", name: "Robotics" }],
    entries: [{ id: "keep", title: "untouched" }],
  };
  const r = check(raw, d);
  assert.deepEqual(r.errors, []);
  r.plan.parts[4].include = false; // untick the chassis
  const { list, project, batch } = planToRecords(r.plan, d, mk, { rawText: raw });
  const ids = new Set(list.map((x) => `${x.col}/${x.doc.id}`));
  assert.ok(!ids.has("entries/keep"));
  assert.ok(list.every((x) => x.col === "parts" && x.doc.id === "mm" ? true : x.doc.importBatchId === batch.id || x.col === "importBatches"));
  assert.equal(batch.rawText, raw);
  assert.equal(project.trackId, "rob");
  assert.equal(project.nextAction, "", "nextAction equal to the first task is left to the task rule");
  const after = toD(list, d);
  assert.equal(after.parts.find((p) => p.id === "mm").projectId, project.id, "spare multimeter assigned");
  const bom = after.bomLines.filter((l) => l.projectId === project.id);
  assert.equal(bom.length, 5);
  assert.equal(bom.find((l) => l.partId === "mm").plannedPriceIdr, 0);
  assert.ok(!after.parts.some((p) => p.name === "4WD robot chassis kit"));
  const t4 = after.tasks.find((t) => t.title === "Assemble the chassis");
  assert.deepEqual(t4.partIds, [], "excluded part dropped from task");
  assert.ok(after.tasks.find((t) => t.title === "Sketch the wiring on paper").skillIds.includes("rd"), "existing skill reused");
  assert.ok(after.skills.some((s) => s.name === "Ultrasonic ranging" && s.domainId === "em"));
  const t6 = after.tasks.find((t) => t.title.startsWith("Wire the driver"));
  assert.equal(t6.dependsOn.length, 1);

  const undo = undoRecords(after.importBatches[0], after);
  const final = toD(undo, after);
  assert.ok(final.projects.find((p) => p.id === project.id).archived);
  assert.ok(final.tasks.every((t) => t.archived));
  assert.equal(final.parts.find((p) => p.id === "mm").status, "spare");
  assert.equal(final.parts.find((p) => p.id === "mm").projectId, null);
  assert.ok(final.importBatches[0].undone);
  assert.ok(!final.skills.find((s) => s.id === "rd").archived, "pre-existing skill untouched");
});

test("copy plan for AI round-trips through the validator", () => {
  const raw = readFileSync(new URL("../public/import/samples/rover.json", import.meta.url), "utf8");
  const d = { parts: [], skills: [], domains: [], tracks: [] };
  const r = check(raw, d);
  const { list, project } = planToRecords(r.plan, d, mk, { rawText: raw });
  const after = toD(list, d);
  after.tasks[0].done = true;
  const out = projectToPlan(after, project.id);
  const again = check(JSON.stringify(out));
  assert.deepEqual(again.errors, []);
  assert.equal(again.plan.tasks.length, 9);
  assert.equal(again.plan.tasks[0].done, true);
  assert.equal(again.plan.parts.length, 6);
});
