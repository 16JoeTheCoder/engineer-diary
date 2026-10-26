// Run from the repo root with the static server up: npm run serve, then node test/browser/e2e.cjs
const SPATH = require("path").join(__dirname, "out"); require("fs").mkdirSync(SPATH, { recursive: true });
const PHOTO = require("path").join(__dirname, "photo.jpg");
const setup = require("./setup.cjs");
const fs = require("fs");
const assert = (c, m) => { if (!c) { throw new Error("FAIL: " + m); } console.log("ok  " + m); };
(async () => {
  const { b, p, errs, pid, go } = await setup();
  const S = (fn, ...a) => p.evaluate(fn, ...a);
  try {
    // 1. Lost and restore
    const part = await S(() => window.__fuse.store.all("parts").find((x) => x.name === "TB6612 motor driver"));
    await go("parts?tab=in_use");
    await p.click(`[data-act="lost"][data-id="${part.id}"]`); await p.waitForTimeout(200);
    let now = await S((id) => window.__fuse.store.get("parts", id), part.id);
    assert(now.status === "lost" && now.projectId === null && now.lostFrom.status === "in_use" && now.lostFrom.projectId === part.projectId, "mark lost stores lostFrom and clears project");
    await go("parts?tab=lost");
    await p.click(`[data-act="restore"][data-id="${part.id}"]`); await p.waitForTimeout(200);
    now = await S((id) => window.__fuse.store.get("parts", id), part.id);
    assert(now.status === "in_use" && now.projectId === part.projectId && !now.lostAt && !now.lostFrom, "found it, restore returns exact status and project");
    assert(now.statusLog.length === part.statusLog.length + 2, "status log appended twice");

    // 2. Entry editor: pending level, photo, measurement, save, level up
    const skill = await S(() => window.__fuse.store.all("skills").find((s) => s.name === "Using a multimeter"));
    await go(`entry/new?type=build&project=${pid}`);
    await p.fill("#d-title", "Measured the battery pack");
    await p.click(`[data-act="skill"][data-id="${skill.id}"]`); await p.waitForTimeout(150);
    let chip = await p.textContent(`[data-act="skill"][data-id="${skill.id}"]`);
    assert(/LV 0 → 1 pending/.test(chip), "pending level on a tagged draft without proof: " + chip.trim());
    await p.click('[data-act="add"][data-k="measurement"]');
    await p.fill('[data-addf="measurement"] [name=value]', "7.42");
    await p.fill('[data-addf="measurement"] [name=unit]', "V");
    await p.fill('[data-addf="measurement"] [name=caption]', "2S pack");
    await p.click('[data-addf="measurement"] button'); await p.waitForTimeout(150);
    chip = await p.textContent(`[data-act="skill"][data-id="${skill.id}"]`);
    assert(/LV 0 → 2 pending/.test(chip), "pending level with proof: " + chip.trim());
    await p.setInputFiles("[data-photo]", PHOTO); await p.waitForTimeout(1200);
    const draft = await S(() => JSON.parse(localStorage.getItem("fuse.draft.new")));
    assert(draft && draft.title === "Measured the battery pack" && draft.evidence.length === 2, "draft autosaved locally with evidence");
    const ph = draft.evidence.find((e) => e.kind === "photo");
    const fullBytes = atob(ph.fullB64).length;
    assert(fullBytes <= 300 * 1024, `photo compressed to ${fullBytes} bytes`);
    // reload: draft survives
    await p.reload(); await p.waitForTimeout(700);
    assert((await p.inputValue("#d-title")) === "Measured the battery pack", "draft restored after reload");
    await p.click('[data-act="save"]'); await p.waitForTimeout(1200);
    const lv = await S((id) => window.__fuse.A.levels().get(id).level, skill.id);
    assert(lv === 2, "skill reached LV 2 from saved proof");
    await p.waitForTimeout(1800);
    const peak = await S((id) => window.__fuse.store.get("skills", id).peakLevel, skill.id);
    assert(peak === 2, "peak level stored so it never goes down");
    const evs = await S(() => window.__fuse.store.all("evidence").filter((e) => e.kind === "photo"));
    assert(evs.length === 1 && evs[0].blobId, "photo evidence references a blob");

    // 3. Search from any screen
    await go("skills");
    await p.keyboard.press("/"); await p.waitForTimeout(100);
    for (const [q, label] of [["tb6612", "Part"], ["overshoots", "Entry"], ["multimeter", "Skill"]]) {
      await p.fill("#sq", q); await p.waitForTimeout(100);
      const kinds = await p.$$eval(".search-pop .res .k", (els) => els.map((e) => e.textContent));
      assert(kinds.includes(label), `search "${q}" finds a ${label}`);
    }
    await p.keyboard.press("Escape");

    // 4. Broken import shows exact paths and fix request
    await go("import");
    await p.fill("#imp-raw", fs.readFileSync(require("path").join(__dirname, "../../public/import/samples/broken.json"), "utf8"));
    await p.click('[data-act="check"]'); await p.waitForTimeout(300);
    const codes = await p.$$eval(".msgs code", (els) => els.map((e) => e.textContent));
    assert(codes.includes("tasks[0].stage") && codes.includes("tasks[1].dependsOn[0]"), "broken file lists exact paths");
    await p.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await p.click('[data-act="copy-fix"]'); await p.waitForTimeout(200);
    const fix = await S(() => navigator.clipboard.readText());
    assert(fix.startsWith("Your JSON could not be imported.") && fix.includes('tasks[0].stage: "testing" is not allowed'), "fix request copied");

    // 5. Good import, edit draft, import, undo
    const before = await S(() => ({ parts: window.__fuse.store.all("parts").length, entries: window.__fuse.store.all("entries").length, projects: window.__fuse.store.all("projects").length }));
    await p.fill("#imp-raw", "Here you go:\n```json\n" + fs.readFileSync(require("path").join(__dirname, "../../public/import/samples/rover.json"), "utf8") + "\n```");
    await p.click('[data-act="check"]'); await p.waitForTimeout(400);
    assert(await p.$('[data-act="import"]'), "valid plan reaches review");
    await p.fill('[data-dr="project.name"]', "Rover edited"); await p.press('[data-dr="project.name"]', "Tab"); await p.waitForTimeout(200);
    await p.click('[data-act="inc"][data-p="parts.4"]'); await p.waitForTimeout(200);
    await p.click('[data-act="mv"][data-i="1"][data-dir="-1"]'); await p.waitForTimeout(200);
    await p.reload(); await p.waitForTimeout(600);
    assert((await p.inputValue('[data-dr="project.name"]')) === "Rover edited", "review draft survives reload");
    await p.click('[data-act="import"]'); await p.waitForTimeout(600);
    const imp = await S(() => { const s = window.__fuse.store; const pr = s.all("projects").find((x) => x.name === "Rover edited"); return { pr, tasks: s.all("tasks").filter((t) => t.projectId === pr.id), batch: s.all("importBatches")[0], chassis: s.all("parts").some((x) => x.name === "4WD robot chassis kit") }; });
    assert(imp.pr && imp.pr.stage === "plan" && imp.tasks.length === 9 && !imp.chassis, "import created the edited project, excluded the unticked part");
    assert(imp.tasks.find((t) => t.order === 0 && t.stage === "plan").title === "Read the TB6612 pin table", "reordered task kept its new order");
    assert(imp.batch.rawText.includes("Here you go"), "raw paste kept untouched");
    const after = await S(() => ({ parts: window.__fuse.store.all("parts").length, entries: window.__fuse.store.all("entries").length }));
    assert(after.entries === before.entries, "import did not touch existing entries");
    await go("import");
    await p.click(`[data-act="undo-import"][data-id="${imp.batch.id}"]`); await p.waitForTimeout(300);
    const undone = await S((id) => { const s = window.__fuse.store; return { arch: s.all("projects", { archived: true }).some((x) => x.id === id), tasks: s.all("tasks").filter((t) => t.projectId === id).length, parts: s.all("parts").length }; }, imp.pr.id);
    assert(undone.arch && undone.tasks === 0 && undone.parts === before.parts, "undo import archived the whole batch");

    // 6. Backup export, wipe, import round trip
    await go("settings");
    const [dl] = await Promise.all([p.waitForEvent("download"), p.click('[data-act="export-backup"]')]);
    const file = SPATH + "/backup.json"; await dl.saveAs(file);
    const snap = await S(() => { const o = window.__fuse.store.snapshot(); return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.length])); });
    const bk = JSON.parse(fs.readFileSync(file, "utf8"));
    assert(bk.blobs.length === 2, "backup includes photo blobs (full + thumb)");
    await S(async () => { await window.__fuse.db.wipeLocal(); });
    await p.reload(); await p.waitForTimeout(700);
    assert((await S(() => window.__fuse.store.all("entries").length)) === 0, "wiped");
    await p.goto(p.url().split("#")[0] + "#/settings"); await p.waitForTimeout(400);
    await p.setInputFiles("[data-backup]", file); await p.waitForTimeout(1500);
    const snap2 = await S(() => { const o = window.__fuse.store.snapshot(); return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.length])); });
    assert(JSON.stringify(snap) === JSON.stringify(Object.fromEntries(Object.keys(snap).map((k) => [k, snap2[k]]))), "every collection restored: " + JSON.stringify(snap2));
    const blob = await S(async () => { const e = window.__fuse.store.all("evidence").find((x) => x.kind === "photo"); const b = await window.__fuse.db.getBlob(e.blobId); return b && b.data.length; });
    assert(blob > 1000, "photo bytes restored");
    // re-import never overwrites newer
    await S(() => { const s = window.__fuse.store; const x = s.all("parts")[0]; s.update("parts", x.id, { name: "Renamed after backup" }); });
    await p.setInputFiles("[data-backup]", file); await p.waitForTimeout(1200);
    assert(await S(() => window.__fuse.store.all("parts").some((x) => x.name === "Renamed after backup")), "restore kept the newer local edit");

    // 7. Report brief
    await go(`p/${pid}`);
    await p.click('[data-act="brief"]'); await p.waitForTimeout(200);
    await p.click("[data-copy]"); await p.waitForTimeout(200);
    const brief = await S(() => navigator.clipboard.readText());
    assert(/^You are a portfolio editor/.test(brief) && brief.includes("## Failures and root causes") && brief.includes("Root cause: STBY was floating"), "report brief copies with role prompt on top");
    await p.keyboard.press("Escape");

    console.log(errs.length ? "ERRORS:\n" + errs.join("\n") : "no console errors");
  } catch (e) { console.log(e.message); console.log(errs.join("\n")); await p.screenshot({ path: SPATH + "/fail.png", fullPage: true }); }
  await b.close();
})();
