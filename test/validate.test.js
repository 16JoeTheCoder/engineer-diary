import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { check, parse, fixRequest } from "../public/import/validate.js";
import { buildPrompt, contextBlock, GENERATOR_PROMPT } from "../public/import/prompt.js";

const sample = (f) => readFileSync(new URL(`../public/import/samples/${f}`, import.meta.url), "utf8");

test("the rover sample imports with no errors", () => {
  const r = check(sample("rover.json"));
  assert.deepEqual(r.errors, []);
  assert.equal(r.plan.project.name, "Obstacle-avoiding rover");
  assert.equal(r.plan.parts.length, 6);
  assert.equal(r.plan.tasks.length, 9);
  assert.ok(r.plan.skills.some((s) => s.name === "Motor drivers"), "task skills are collected");
  assert.ok(r.warnings.some((w) => w.path === "parts[1].priceIdr") === false, "owned part with null price is not warned");
});

test("chat text, code fences, trailing commas and dirty values are cleaned", () => {
  const r = check(sample("chatty-reply.txt"));
  assert.deepEqual(r.errors, []);
  const { project, parts, tasks } = r.plan;
  assert.equal(project.name, "Blink test");
  assert.equal(project.budgetCapIdr, 50000);
  assert.equal(parts[0].qty, 10);
  assert.equal(parts[0].priceIdr, 5000);
  assert.equal(parts[0].tags[0].length, 24);
  assert.equal(tasks[0].stage, "build");
  assert.equal(tasks[0].estMinutes, 240);
  const paths = r.warnings.map((w) => w.path);
  assert.ok(paths.includes("tasks[0].mood"), "unknown field warned");
  assert.ok(paths.includes("tasks[0].estMinutes"));
  assert.ok(r.warnings.some((w) => /no test task/.test(w.msg)));
});

test("the broken sample reports every error with its exact path", () => {
  const r = check(sample("broken.json"));
  const paths = r.errors.map((e) => e.path);
  for (const p of ["parts[0].qty", "parts[1].ref", "parts[1].qty", "tasks[0].stage", "tasks[1].dependsOn[0]", "tasks[1].partRefs[0]", "tasks[4].title"]) {
    assert.ok(paths.includes(p), `missing ${p}: ${paths.join(", ")}`);
  }
  assert.ok(r.errors.some((e) => /loop/.test(e.msg)), "dependency loop found");
  assert.equal(r.plan, null);
  const fix = fixRequest(r.errors);
  assert.match(fix, /^Your JSON could not be imported\./);
  assert.match(fix, /- tasks\[0\]\.stage: "testing" is not allowed\. Use one of plan, order, build, test, document\./);
  assert.match(fix, /- tasks\[1\]\.dependsOn\[0\]: "t30" does not exist\./);
  assert.match(fix, /Keep every other part of the plan as it was\.$/);
});

test("fix request truncates to 10 items", () => {
  const errs = Array.from({ length: 14 }, (_, i) => ({ path: `tasks[${i}].stage`, msg: "bad." }));
  const lines = fixRequest(errs).split("\n").filter((l) => l.startsWith("- "));
  assert.equal(lines.length, 11);
});

test("wrong schema major version is an error", () => {
  const r = check(sample("wrong-version.json"));
  assert.equal(r.errors[0].path, "schema");
});

test("invalid JSON reports line and column", () => {
  const r = parse('{\n  "schema": "fuse.project/1",\n  "project": { "name": oops }\n}');
  assert.match(r.error.msg, /line 3, column \d+/);
});

test("limits are enforced", () => {
  const big = { schema: "fuse.project/1", project: { name: "x".repeat(501) }, parts: Array.from({ length: 61 }, (_, i) => ({ ref: `p${i}`, name: "a", qty: 1 })) };
  const r = check(JSON.stringify(big));
  assert.ok(r.errors.some((e) => e.path === "project.name"));
  assert.ok(r.errors.some((e) => e.path === "parts"));
  assert.equal(check("{" + " ".repeat(205000) + "}").errors[0].path, "(file)");
});

test("parts and skills match inventory as suggestions", () => {
  const ctx = {
    parts: [
      { id: "a", name: "Multimeter!", status: "spare", qty: 2 },
      { id: "b", name: "hc sr04 ultrasonic sensor", status: "lost", qty: 1 },
    ],
    skills: [{ id: "s1", name: "Reading datasheets" }, { id: "s2", name: "Soldering" }],
  };
  const plan = JSON.parse(sample("rover.json"));
  plan.tasks[0].skills = ["datasheets"];
  plan.tasks[1].skills = ["Soldering basics"];
  const r = check(JSON.stringify(plan), ctx);
  assert.equal(r.plan.parts[1].match.partId, "a");
  assert.ok(r.warnings.some((w) => w.path === "parts[1].name" && /You own 2/.test(w.msg)));
  assert.equal(r.plan.parts[3].lostMatch.partId, "b");
  assert.equal(r.plan.skills.find((s) => s.name === "datasheets").matchId, "s1");
  assert.equal(r.plan.skills.find((s) => s.name === "Soldering basics").matchId, "s2");
});

test("over budget and unusual URL warn but do not block", () => {
  const plan = JSON.parse(sample("rover.json"));
  plan.project.budgetCapIdr = 100000;
  plan.resources[0].url = "http://192.168.1.1/x";
  const r = check(JSON.stringify(plan));
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.some((w) => w.path === "project.budgetCapIdr"));
  assert.ok(r.warnings.some((w) => w.path === "resources[0].url"));
});

test("HTML in imported text is stripped", () => {
  const r = check(JSON.stringify({ schema: "fuse.project/1", project: { name: '<img src=x onerror="alert(1)">Rover<script>x</script>' } }));
  assert.equal(r.plan.project.name, "Roverx");
});

test("prompt carries the schema and skill list; context block stays small", () => {
  assert.match(GENERATOR_PROMPT, /fuse\.project\/1/);
  const parts = Array.from({ length: 300 }, (_, i) => ({ name: `Part number ${i} with a long name`, qty: 3, status: "spare" }));
  const block = contextBlock({ parts, skills: [{ name: "Soldering", level: 2 }], budget: 500000 });
  assert.ok(block.length <= 3000, `context is ${block.length} bytes`);
  const p = buildPrompt({ skills: [{ name: "Soldering", level: 2 }], parts, includeContext: true });
  assert.match(p, /Prefer skill names from this list when they fit, and add new ones only when needed: Soldering\./);
  assert.match(p, /MY INVENTORY AND SKILLS/);
});
