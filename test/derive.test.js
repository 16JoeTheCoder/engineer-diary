import { test } from "node:test";
import assert from "node:assert/strict";
import { skillLevels, pendingLevels, projectCosts, nextAction, overallCostPerSkill } from "../public/js/derive.js";

const base = () => ({
  skills: [{ id: "s1", name: "Soldering" }, { id: "s2", name: "PID control" }],
  entries: [], evidence: [], resources: [], projects: [{ id: "A" }, { id: "B" }], bomLines: [], purchases: [], tasks: [],
});
const entry = (id, o = {}) => ({ id, type: "build", projectId: "A", skillIds: ["s1"], tags: [], createdAt: "2026-10-01T10:00:00Z", ...o });
const proof = (id, entryId, kind = "photo") => ({ id, entryId, kind });

test("level ladder follows the evidence rules", () => {
  const d = base();
  assert.equal(skillLevels(d).get("s1").level, 0);
  d.resources.push({ id: "r", skillIds: ["s1"] });
  assert.equal(skillLevels(d).get("s1").level, 1, "resource counts as a note");
  d.entries.push(entry("e1"));
  d.evidence.push(proof("v1", "e1", "link"));
  assert.equal(skillLevels(d).get("s1").level, 1, "a link is not proof");
  d.evidence.push(proof("v2", "e1", "measurement"));
  assert.equal(skillLevels(d).get("s1").level, 2);
  d.entries.push(entry("e2", { type: "fail", fields: { fix: "Re-flowed the joint" } }));
  d.evidence.push(proof("v3", "e2", "photo"));
  assert.equal(skillLevels(d).get("s1").level, 2, "fail proof without a second project stays at 2 (ladder)");
  d.entries.push(entry("e3", { projectId: "B" }));
  d.evidence.push(proof("v4", "e3", "snippet"));
  assert.equal(skillLevels(d).get("s1").level, 4);
  d.entries.push(entry("e4", { type: "reflect", tags: ["taught"] }));
  assert.equal(skillLevels(d).get("s1").level, 5);
  assert.equal(skillLevels(d).get("s1").proofCount, 3);
});

test("fail entry without a fix does not earn level 4", () => {
  const d = base();
  d.entries.push(entry("e1"), entry("e2", { projectId: "B", type: "fail", fields: { fix: "  " } }));
  d.evidence.push(proof("a", "e1"), proof("b", "e2"));
  assert.equal(skillLevels(d).get("s1").level, 3);
});

test("a level never goes down", () => {
  const d = base();
  d.skills[0].peakLevel = 3;
  assert.equal(skillLevels(d).get("s1").level, 3);
  assert.equal(skillLevels(d).get("s1").computed, 0);
});

test("archived proof does not count", () => {
  const d = base();
  d.entries.push(entry("e1"));
  d.evidence.push({ ...proof("a", "e1"), archived: true });
  assert.equal(skillLevels(d).get("s1").level, 1);
});

test("pending levels on an unsaved draft", () => {
  const d = base();
  const p = pendingLevels(d, { type: "build", projectId: "A", skillIds: ["s1", "s2"], tags: [] }, [{ id: "x", kind: "photo" }]);
  assert.deepEqual(p.get("s1"), { before: 0, after: 2 });
  assert.deepEqual(p.get("s2"), { before: 0, after: 2 });
  const q = pendingLevels(d, { type: "build", projectId: "A", skillIds: ["s1"], tags: [] }, []);
  assert.deepEqual(q.get("s1"), { before: 0, after: 1 });
});

test("budget, variance and cost per skill match hand-checked numbers", () => {
  const d = base();
  d.bomLines.push(
    { id: "l1", projectId: "A", qty: 2, plannedPriceIdr: 28000 },   // 56.000
    { id: "l2", projectId: "A", qty: 1, plannedPriceIdr: 65000 },   // 65.000
    { id: "l3", projectId: "A", qty: 1, plannedPriceIdr: 90000, fromInventory: true }, // 0
    { id: "l4", projectId: "A", qty: 1, plannedPriceIdr: null },    // unpriced
    { id: "l5", projectId: "B", qty: 1, plannedPriceIdr: 99999 },
  );
  d.purchases.push(
    { id: "p1", projectId: "A", priceIdr: 27500, qty: 2 }, // 55.000
    { id: "p2", projectId: "A", priceIdr: 70000, qty: 1 }, // 70.000
    { id: "p3", projectId: "B", priceIdr: 1000, qty: 1 },
  );
  d.entries.push(entry("e1", { skillIds: ["s1", "s2"] }), entry("e2", { skillIds: ["s2"] }));
  d.evidence.push(proof("a", "e1"), proof("b", "e2"));
  const c = projectCosts(d, "A", { budgetCapIdr: 100000 });
  assert.equal(c.planned, 121000);
  assert.equal(c.actual, 125000);
  assert.equal(c.variance, 4000);
  assert.equal(c.provenSkills, 2);
  assert.equal(c.costPerSkill, 62500);
  assert.equal(c.unpriced, 1);
  assert.equal(c.overCap, true);
  assert.equal(overallCostPerSkill(d).actual, 126000);
});

test("next smallest action: override, then first ready task in current stage", () => {
  const d = base();
  const p = { id: "A", stage: "build" };
  d.tasks.push(
    { id: "t1", projectId: "A", stage: "plan", title: "Sketch", order: 0, done: false },
    { id: "t2", projectId: "A", stage: "build", title: "Wire driver", order: 0, done: false, dependsOn: ["t3"] },
    { id: "t3", projectId: "A", stage: "build", title: "Assemble chassis", order: 1, done: false },
  );
  assert.equal(nextAction(d, p).text, "Assemble chassis");
  d.tasks[2].done = true;
  assert.equal(nextAction(d, p).text, "Wire driver");
  assert.equal(nextAction(d, { ...p, nextAction: "Buy solder" }).text, "Buy solder");
});
