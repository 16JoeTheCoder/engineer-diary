// Clearly labelled sample data: the Line-follower v1 project. Every record carries sample: true,
// so "Remove sample data" archives exactly these and nothing of Josef's.
import * as store from "./store.js";
import { seedDomains } from "./screens/skills.js";

export const hasSample = () => store.all("projects").some((p) => p.sample);

const daysAgo = (n, h = 19, m = 0) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(h, m, 0, 0); return d.toISOString(); };

export function loadSample() {
  seedDomains();
  const dom = (name) => store.all("domains").find((d) => d.name === name)?.id;
  let track = store.all("tracks").find((t) => t.name === "Robotics");
  if (!track) track = store.add("tracks", { name: "Robotics", color: "#FF6A1A" });
  const S = { sample: true };
  const list = [];
  const mk = (col, f, at) => { const doc = store.make(col, { ...f, ...S }); if (at) { doc.createdAt = at; doc.updatedAt = at; } list.push({ col, doc }); return doc; };

  const sk = Object.fromEntries([
    ["sold", "Soldering", "Electronics"], ["mm", "Using a multimeter", "Electronics"], ["ds", "Reading datasheets", "Electronics"],
    ["drv", "Motor drivers", "Embedded"], ["ir", "IR line sensing", "Embedded"], ["mp", "MicroPython programming", "Coding"],
    ["pid", "PID control", "Control"], ["bat", "Li-ion battery safety", "Power and renewables"], ["chas", "Mechanical assembly", "Mechanical"],
  ].map(([k, name, d]) => [k, mk("skills", { name, domainId: dom(d), why: "", peakLevel: 0 })]));

  const p = mk("projects", { trackId: track.id, name: "Line-follower v1", summary: "A two-wheel robot that follows a black line on white paper using five IR sensors and PID.",
    stage: "test", stageDates: { plan: daysAgo(40).slice(0, 10), order: daysAgo(36).slice(0, 10), build: daysAgo(28).slice(0, 10), test: daysAgo(6).slice(0, 10) },
    budgetCapIdr: 350000, aims: [{ text: "Finish one lap of the A3 oval track without leaving the line", met: null, reflection: "" }, { text: "Explain PID to a friend with my own plots", met: null, reflection: "" }],
    nextAction: "", risks: [{ text: "Shorting the 18650 cells while wiring.", mitigation: "Check polarity with the multimeter before every connection." }], closedAt: null }, daysAgo(40));

  const part = (name, category, qty, status, price, extra = {}) => mk("parts", { name, category, qty, status, projectId: ["in_use", "ordered", "planned", "tested"].includes(status) ? p.id : null,
    links: price ? [{ shop: "Shopee", url: `https://shopee.co.id/search?keyword=${encodeURIComponent(name)}` }] : [], lastPaidIdr: price, tags: extra.tags || [], lostAt: extra.lostAt || null, lostFrom: extra.lostFrom || null,
    source: "manual", priceIsEstimate: false, searchQuery: name, statusLog: [{ at: daysAgo(36), status }] });
  const esp = part("ESP32 DevKit V1", "controller", 1, "in_use", 65000, { tags: ["wifi"] });
  const drv = part("TB6612 motor driver", "driver", 1, "in_use", 28000);
  const ir = part("TCRT5000 IR sensor array, 5 channel", "sensor", 1, "in_use", 32000);
  const mot = part("N20 gear motor 300 rpm", "motor", 2, "in_use", 38000);
  const bat = part("18650 cell", "power", 2, "spare", 25000);
  const mm = part("Multimeter DT830B", "tool", 1, "spare", 55000);
  part("Mini breadboard", "prototyping", 3, "spare", 6000);
  part("Wheel 43 mm", "mechanical", 2, "lost", 12000, { lostAt: daysAgo(9), lostFrom: { status: "in_use", projectId: p.id } });
  part("Pololu QTR-8RC reflectance sensor", "sensor", 1, "wishlist", null);
  part("Ball caster", "mechanical", 1, "ordered", 9000);

  const line = (pt, qty, price, inv = false) => mk("bomLines", { projectId: p.id, partId: pt.id, name: pt.name, qty, plannedPriceIdr: inv ? 0 : price, fromInventory: inv, links: [] });
  line(esp, 1, 60000); line(drv, 1, 30000); line(ir, 1, 30000); line(mot, 2, 35000); line(bat, 2, 0, true); line(mm, 1, 0, true);
  const buy = (pt, price, qty, ago) => mk("purchases", { partId: pt.id, projectId: p.id, priceIdr: price, qty, shop: "Shopee", date: daysAgo(ago).slice(0, 10) }, daysAgo(ago));
  buy(esp, 65000, 1, 35); buy(drv, 28000, 1, 35); buy(ir, 32000, 1, 35); buy(mot, 38000, 2, 34);

  const t = (stage, title, order, done, skillIds = [], proofKinds = [], est = 30) => mk("tasks", { projectId: p.id, stage, title, detail: "", estMinutes: est, order, done, doneAt: done ? daysAgo(10) : null, partIds: [], skillIds, proofKinds, dependsOn: [], entryId: null });
  t("plan", "Sketch the wiring on paper", 0, true, [sk.ds.id], ["photo"], 20);
  t("order", "Order the parts on Shopee", 0, true, [], ["note"], 20);
  t("build", "Solder headers on the driver", 0, true, [sk.sold.id], ["photo"], 40);
  t("build", "Spin both motors from MicroPython", 1, true, [sk.drv.id, sk.mp.id], ["snippet"], 45);
  t("test", "Log raw IR readings on black and white", 0, true, [sk.ir.id], ["measurement"], 30);
  t("test", "Tune Kp until it follows a straight line", 1, false, [sk.pid.id], ["measurement", "photo"], 60);
  t("test", "Full lap of the oval, three runs", 2, false, [sk.pid.id], ["measurement"], 45);
  t("document", "Write what PID taught me", 0, false, [sk.pid.id], ["note"], 40);

  const entry = (ago, type, title, f, skills, extra = {}) => mk("entries", { projectId: p.id, type, title, fields: f, bodyMd: extra.body || "", tags: extra.tags || [], partIds: extra.parts || [], skillIds: skills, resourceIds: [], sessionSec: extra.sec || 1800, taskId: null }, daysAgo(ago, extra.h || 19));
  const ev = (e, kind, f) => mk("evidence", { entryId: e.id, kind, caption: "", value: "", unit: "", text: "", blobId: null, thumbId: null, bytes: 0, ...f }, e.createdAt);

  let e = entry(38, "decision", "ESP32 over Arduino Nano", { question: "Which board?", options: "Arduino Nano, ESP32", choice: "ESP32", why: "Same price on Shopee, more PWM pins, MicroPython works." }, [sk.ds.id]);
  e = entry(30, "build", "Soldered the driver headers", {}, [sk.sold.id], { body: "First time soldering headers. Tinned the tip, 330 degrees.", sec: 2400 });
  ev(e, "snippet", { caption: "Joint checklist", text: "shiny, cone shaped, no bridges: 16/16" });
  e = entry(27, "fail", "Motor A does not spin", { symptom: "Motor A silent, motor B fine.", hypothesis: "Bad solder joint on AIN2.", fix: "Re-flowed AIN2 and tied STBY high.", rootCause: "STBY was floating, so the driver stayed in standby." }, [sk.drv.id, sk.sold.id], { sec: 3600 });
  ev(e, "measurement", { caption: "STBY voltage after fix", value: "3.29", unit: "V" });
  e = entry(25, "build", "Both motors spin from MicroPython", {}, [sk.drv.id, sk.mp.id], { sec: 2700 });
  ev(e, "snippet", { caption: "PWM test", text: "from machine import Pin, PWM\nm = PWM(Pin(25), freq=1000)\nm.duty(600)" });
  e = entry(18, "experiment", "IR readings on black vs white", { hypothesis: "Black reads above 3000, white below 800.", setup: "Sensor 8 mm above A4 paper, room light.", result: "Clear gap. Threshold at 2000 works." }, [sk.ir.id], { sec: 2100 });
  ev(e, "measurement", { caption: "white paper, sensor 3", value: "640", unit: "ADC" });
  ev(e, "measurement", { caption: "black tape, sensor 3", value: "3410", unit: "ADC" });
  e = entry(12, "purchase", "Bought a ball caster", { qty: 1, priceIdr: 9000, shop: "Shopee" }, [], { sec: 0 });
  e = entry(9, "fail", "Robot overshoots every curve", { symptom: "Leaves the line on the first bend.", hypothesis: "Kp too high.", fix: "Lowered Kp from 2.0 to 0.8, added Kd 0.3.", rootCause: "No damping, so every correction overshot." }, [sk.pid.id], { sec: 4200 });
  ev(e, "measurement", { caption: "max lateral error after fix", value: "1.8", unit: "cm" });
  e = entry(4, "experiment", "Lap time vs base speed", { hypothesis: "Faster than 60 percent duty leaves the line.", setup: "Oval A3 track, Kp 0.8, Kd 0.3.", result: "60 percent is the limit for now." }, [sk.pid.id], { sec: 3000, h: 20 });
  ev(e, "measurement", { caption: "lap at 50 percent duty", value: "14.2", unit: "s" });
  ev(e, "measurement", { caption: "lap at 60 percent duty", value: "11.9", unit: "s" });
  e = entry(1, "reflect", "Why damping matters", {}, [sk.pid.id], { body: "Kd reacts to how fast the error changes, so it brakes the correction before it overshoots.", sec: 900 });

  mk("resources", { title: "TB6612FNG datasheet", url: "", type: "datasheet", note: "Read the STBY pin first.", projectId: p.id, skillIds: [sk.drv.id] });
  mk("resources", { title: "MicroPython PWM docs", url: "https://docs.micropython.org/en/latest/esp32/quickref.html", type: "article", note: "", projectId: p.id, skillIds: [sk.mp.id] });

  store.commit(list).catch(() => {});
  store.saveSettings({ activeProjectId: p.id });
}

export function removeSample() {
  const t = new Date().toISOString();
  const list = [];
  for (const col of ["projects", "parts", "bomLines", "purchases", "entries", "evidence", "skills", "tasks", "resources"])
    for (const d of store.all(col)) if (d.sample) list.push({ col, doc: { ...d, archived: true, updatedAt: t } });
  return store.commit(list).catch(() => {});
}
