import { test } from "node:test";
import assert from "node:assert/strict";
import { formatRp } from "../public/js/util.js";
import { backupState, proofGap, judge, sectionOf } from "../public/js/derive.js";
import { buildBackup, migrate, mergePlan, checkBackup, SCHEMA_VERSION } from "../public/js/backup.js";
import { normaliseFile, MAX_FILE_BYTES } from "../public/js/file-types.js";
import { hashPasscode, verifyPasscode } from "../public/js/security.js";

test("formatRp: full and compact", () => {
  assert.equal(formatRp(201000).replace(/\s/g, " "), "Rp 201.000");
  assert.equal(formatRp(201000, { compact: true }).replace(/\s/g, " "), "Rp 201 rb");
  assert.equal(formatRp(1250000, { compact: true }).replace(/\s/g, " "), "Rp 1,3 jt");
  assert.equal(formatRp(950, { compact: true }).replace(/\s/g, " "), "Rp 950");
  assert.equal(formatRp(null), "Rp —");
});

test("backup reminder: 10 entries or 14 days", () => {
  const now = Date.parse("2026-11-03T12:00:00Z");
  assert.equal(backupState({}, false, now).due, false, "no data, nothing due");
  assert.equal(backupState({}, true, now).due, true, "never backed up");
  assert.equal(backupState({ lastBackupAt: "2026-11-01T12:00:00Z", entriesSinceBackup: 9 }, true, now).due, false);
  assert.equal(backupState({ lastBackupAt: "2026-11-01T12:00:00Z", entriesSinceBackup: 10 }, true, now).due, true);
  assert.equal(backupState({ lastBackupAt: "2026-10-20T12:00:00Z", entriesSinceBackup: 0 }, true, now).due, true);
});

test("checkBackup reports counts without importing, and refuses junk", () => {
  const r = checkBackup(JSON.stringify(buildBackup({ entries: [{ id: "e1" }, { id: "e2" }], parts: [] }, [])));
  assert.equal(r.records, 2);
  assert.deepEqual(r.counts, { entries: 2 });
  assert.throws(() => checkBackup("{nope"), /not valid JSON/);
  assert.throws(() => checkBackup('{"a":1}'), /not a Fuse backup/);
});

test("v1 backup migrates to v2 with defaults, unchanged in meaning", () => {
  const v1 = { format: "fuse.backup", schemaVersion: 1, collections: { projects: [{ id: "p1", name: "Rover", stage: "build", updatedAt: "2026-10-01" }], entries: [{ id: "e1", type: "fail", title: "x" }] }, blobs: [] };
  const m = migrate(structuredClone(v1));
  assert.equal(m.schemaVersion, SCHEMA_VERSION);
  const p = m.collections.projects[0];
  assert.equal(p.name, "Rover"); assert.equal(p.stage, "build");
  assert.equal(p.status, "active"); assert.equal(p.mode, "free"); assert.equal(p.station, 1); assert.equal(p.writeup, "");
  assert.deepEqual(p.problem.successMeasure, { text: "", op: ">=", value: null, unit: "" });
  assert.deepEqual(m.collections.entries, v1.collections.entries);
  assert.deepEqual(m.collections.files, []);
  // idempotent: migrating the result again changes nothing
  assert.deepEqual(migrate({ ...m, schemaVersion: 1 }).collections, m.collections);
});

test("a v2 backup re-imports without duplicates", () => {
  const file = migrate(buildBackup({ projects: [{ id: "p1", updatedAt: "2026-10-01" }], files: [{ id: "f1", updatedAt: "2026-10-01" }] }, []));
  const first = mergePlan(file, {});
  assert.equal(first.added, 2);
  const current = { projects: [file.collections.projects[0]], files: [file.collections.files[0]] };
  const again = mergePlan(file, current);
  assert.equal(again.added, 0); assert.equal(again.list.length, 0);
});

test("proofGap names the finished task with no proof", () => {
  const p = { id: "p" };
  const tasks = [
    { id: "t1", projectId: "p", stage: "build", done: true, proofKinds: ["photo"], entryId: "e1" },
    { id: "t2", projectId: "p", stage: "build", order: 1, done: true, proofKinds: ["measurement"], title: "Tune Kp" },
    { id: "t3", projectId: "p", stage: "plan", done: true, proofKinds: ["note"] },
  ];
  const entries = [{ id: "e1", projectId: "p" }];
  const evidence = [{ entryId: "e1", kind: "photo" }];
  assert.deepEqual(proofGap(p, tasks, entries, evidence), { taskId: "t2", title: "Tune Kp", needs: ["measurement"] });
  assert.equal(proofGap(p, tasks.slice(0, 1), entries, evidence), null);
  assert.equal(proofGap(null, tasks, entries, evidence), null);
});

test("success measure judge and sections", () => {
  assert.equal(judge({ op: ">=", value: 3 }, "3.2"), true);
  assert.equal(judge({ op: "<=", value: 20 }, 21), false);
  assert.equal(judge({ op: "=", value: 5 }, 5), true);
  assert.equal(judge({ op: ">=", value: null }, 5), null);
  assert.equal(sectionOf({ type: "fail" }), "appendix-fails");
  assert.equal(sectionOf({ type: "build", section: "tests" }), "tests");
});

test("file allow-list and size limit", () => {
  assert.deepEqual(normaliseFile("bracket-v3.STL", 10), { mime: "model/stl", kind: "model" });
  assert.equal(normaliseFile("a.stp", 1).mime, "application/step");
  assert.throws(() => normaliseFile("virus.exe", 10), /does not take/);
  assert.throws(() => normaliseFile("big.pdf", MAX_FILE_BYTES + 1), /limit is 200 MB/);
});

test("passcode hash verifies only the right code", async () => {
  const rec = await hashPasscode("1234", { iterations: 1000 });
  assert.equal(await verifyPasscode("1234", rec), true);
  assert.equal(await verifyPasscode("1235", rec), false);
  assert.equal(await verifyPasscode("1234", null), false);
});

import { nextStation, prevStation, canSkip, stationOutputPresent, leaveStation, resumeLine, assembleWriteup, verdict, stuckPrompt } from "../public/js/flow.js";

test("flow: stations move 1..7 and Next never blocks", () => {
  assert.equal(nextStation(1), 2); assert.equal(nextStation(7), 7); assert.equal(prevStation(1), 1);
  assert.equal(canSkip(3), true);
});

test("flow: outputs and later marks", () => {
  const p = { id: "p", problem: { statement: "x", successMeasure: { text: "y" } }, stationState: {} };
  const d = { entries: [{ id: "e", projectId: "p", type: "study", title: "PID" }], tasks: [], bomLines: [] };
  assert.equal(stationOutputPresent(1, p, d), true);
  assert.equal(stationOutputPresent(2, p, d), true);
  assert.equal(stationOutputPresent(3, p, d), false);
  assert.deepEqual(leaveStation(p, 3, d), { 3: "later" });
  assert.deepEqual(leaveStation({ ...p, stationState: { 2: "later" } }, 2, d), {});
});

test("flow: resume line, verdict, write-up keeps the user's words", () => {
  const p = { id: "p", station: 5, nextAction: "Tune Kp", problem: { statement: "Robot leaves the line.", forWhom: "Me", successMeasure: { text: "laps", op: ">=", value: 3, unit: "laps" } }, testResult: { value: "3", note: "Three runs." } };
  const entries = [{ id: "a", projectId: "p", type: "fail", title: "Overshoot", fields: { fix: "Lower Kp" }, createdAt: "2026-11-01T10:00:00Z" },
    { id: "b", projectId: "p", type: "reflect", title: "Damping", bodyMd: "Kd brakes.", createdAt: "2026-11-02T10:00:00Z" }];
  assert.equal(resumeLine(p, entries, []), "Last time: Damping on 2026-11-02. Next: Tune Kp");
  assert.equal(verdict(p).text, "Met");
  const w = assembleWriteup(p, entries);
  for (const s of ["Robot leaves the line.", "Overshoot. Fix: Lower Kp", "Kd brakes.", "3 laps against the measure: Met.", "Three runs."]) assert.ok(w.includes(s), s);
  assert.ok(stuckPrompt({ ...p, name: "Rover" }, { entries, bomLines: [] }, 5).includes("Current station: 5. Build"));
});
