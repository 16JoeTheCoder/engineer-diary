import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { buildDocument } from "../public/js/export.js";
import { renderMarkdown } from "../public/js/export-md.js";
import { renderHtml } from "../public/js/export-html.js";
import { zip, crc32 } from "../public/js/zip.js";

const T = (n) => `2026-10-${String(n).padStart(2, "0")}T10:00:00.000Z`;
const base = (id, n, f) => ({ id, createdAt: T(n), updatedAt: T(n), archived: false, ...f });
export const fixture = {
  tracks: [base("tr", 1, { name: "Robotics" })],
  projects: [base("p", 1, { trackId: "tr", name: "Line-follower v1", summary: "", budgetCapIdr: 350000, writeup: "## Problem\n\nMy robot leaves the line.\n\nI tuned it.",
    problem: { statement: "My robot leaves the line on every bend.", forWhom: "Me", successMeasure: { text: "Laps without leaving the line", op: ">=", value: 3, unit: "laps" } }, testResult: { value: "3", note: "Three runs on the A3 oval." } })],
  skills: [base("s1", 1, { name: "PID control" })],
  entries: [
    base("e1", 2, { projectId: "p", type: "study", title: "PID", fields: { concept: "Feedback control.", equations: "u = Kp e" }, skillIds: ["s1"] }),
    base("e2", 3, { projectId: "p", type: "decision", title: "ESP32", fields: { question: "Which board?", options: "Arduino Nano\nESP32", why: "More PWM pins.", changeMyMind: "If Wi-Fi drew too much current." } }),
    base("e3", 4, { projectId: "p", type: "fail", title: "Overshoot", fields: { symptom: "Leaves the line.", rootCause: "No damping.", fix: "Kd 0.3." }, skillIds: ["s1"] }),
    base("e4", 5, { projectId: "p", type: "build", title: "Soldered headers", bodyMd: "Tinned the tip." }),
    base("e5", 6, { projectId: "p", type: "reflect", title: "Parked idea", parked: true }),
  ],
  evidence: [base("v1", 4, { entryId: "e3", kind: "measurement", value: "1.8", unit: "cm", caption: "error" }), base("v2", 5, { entryId: "e4", kind: "photo", caption: "Headers", blobId: "b1" })],
  bomLines: [base("l1", 1, { projectId: "p", partId: "pt", name: "ESP32", qty: 1, plannedPriceIdr: 65000, fromInventory: false })],
  parts: [base("pt", 1, { name: "ESP32 DevKit" })],
  purchases: [base("u1", 3, { projectId: "p", partId: "pt", priceIdr: 65000, qty: 1, shop: "Shopee", date: "2026-10-03" })],
  resources: [base("r1", 1, { projectId: "p", title: "PID primer", type: "article", url: "https://example.com/pid" })],
  files: [base("f1", 6, { projectId: "p", name: "chassis.stl", section: "models-drawings", status: "ready", size: 1000, deletedAt: null, caption: "Chassis" })],
};
const golden = (name, text) => {
  const p = new URL(`./golden/${name}`, import.meta.url);
  if (process.env.UPDATE_GOLDEN || !existsSync(p)) writeFileSync(p, text);
  assert.equal(text, readFileSync(p, "utf8"), `${name} differs from the golden file (UPDATE_GOLDEN=1 to accept)`);
};

test("buildDocument matches the golden model", () => {
  const doc = buildDocument(fixture, "p", { now: "2026-11-03T00:00:00.000Z" });
  golden("document.json", JSON.stringify(doc, null, 2) + "\n");
  assert.equal(doc.glance.result.verdict, "Met");
  assert.equal(doc.figures[0].n, 1);
  assert.equal(doc.provenance.entries, 5);
});

test("Markdown export matches the golden file", () => {
  golden("project.md", renderMarkdown(buildDocument(fixture, "p", { now: "2026-11-03T00:00:00.000Z" })));
});

test("HTML export escapes text, has no external requests and no background fills in print", () => {
  const evil = structuredClone(fixture);
  evil.projects[0].problem.statement = '<script>alert(1)</script>';
  const out = renderHtml(buildDocument(evil, "p", { now: "2026-11-03T00:00:00.000Z" }), { images: { "assets/fig-01.jpg": "data:image/jpeg;base64,AAAA" } });
  assert.ok(!out.includes("<script>alert"));
  assert.ok(!/(src)="https?:/.test(out), "no external src");
  const links = [...out.matchAll(/href="(https?:[^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(links, ["https://example.com/pid"], "only links the user typed");
  const print = out.slice(out.indexOf("@media print"));
  assert.ok(!/background(-color)?:(?!\s*none)/.test(print.slice(0, print.indexOf("</style>"))));
  assert.ok(!/gradient|box-shadow/.test(out));
});

test("zip central directory parses and CRC-32 matches", () => {
  const files = [{ name: "a.txt", data: "hello" }, { name: "assets/b.bin", data: new Uint8Array([1, 2, 3]) }];
  const z = zip(files, new Date(2026, 10, 3));
  const v = new DataView(z.buffer);
  const eocd = z.length - 22;
  assert.equal(v.getUint32(eocd, true), 0x06054b50);
  assert.equal(v.getUint16(eocd + 10, true), 2);
  let at = v.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (const f of files) {
    assert.equal(v.getUint32(at, true), 0x02014b50);
    const n = v.getUint16(at + 28, true), off = v.getUint32(at + 42, true), size = v.getUint32(at + 20, true);
    assert.equal(dec.decode(z.subarray(at + 46, at + 46 + n)), f.name);
    const ln = v.getUint16(off + 26, true);
    const data = z.subarray(off + 30 + ln, off + 30 + ln + size);
    assert.equal(v.getUint32(at + 16, true), crc32(data));
    at += 46 + n;
  }
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});
