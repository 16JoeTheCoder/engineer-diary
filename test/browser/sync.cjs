// Run from the repo root with the static server up: npm run serve, then node test/browser/sync.cjs
const SPATH = require("path").join(__dirname, "out"); require("fs").mkdirSync(SPATH, { recursive: true });
const PHOTO = require("path").join(__dirname, "photo.jpg");
const { chromium } = require("playwright");
const fs = require("fs");
const PKG = require("path").dirname(require.resolve("firebase/package.json")) + "/"; // npm i --no-save firebase@13.0.0
const assert = (c, m) => { if (!c) throw new Error("FAIL: " + m); console.log("ok  " + m); };
const URL0 = "http://localhost:8080/?emulator&nosw";
async function device(b, name, url = URL0) {
  const ctx = await b.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.route("https://www.gstatic.com/firebasejs/13.0.0/*", (r) => {
    const f = r.request().url().split("/").pop();
    r.fulfill({ status: 200, contentType: "application/javascript", headers: { "access-control-allow-origin": "*" }, body: fs.readFileSync(PKG + f) });
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(name + " pageerror: " + e.message));
  p.on("console", (m) => { if (m.type() === "error") errs.push(name + ": " + m.text()); });
  await p.goto(url + "#/home"); await p.waitForTimeout(1500);
  return { ctx, p, errs };
}
const n = (p, col) => p.evaluate((c) => window.__fuse.store.all(c).length, col);
const state = (p) => p.evaluate(() => window.__fuse.store.status.state);
(async () => {
  const b = await chromium.launch();
  const A = await device(b, "A"), B = await device(b, "B", "http://localhost:8080/?emulator");
  await B.p.evaluate(() => navigator.serviceWorker.ready); await B.p.reload(); await B.p.waitForTimeout(1500);
  try {
    assert(await A.p.isVisible('[data-act="signin"]'), "signed-out device shows Google sign-in");
    await A.p.click('[data-act="signin"]'); await A.p.waitForTimeout(2000);
    await A.p.click('[data-act="sample"]'); await A.p.waitForTimeout(3000);
    assert((await n(A.p, "entries")) === 9, "device A wrote sample data");
    assert((await state(A.p)) === "synced", "device A status: synced");
    await B.p.click('[data-act="signin"]'); await B.p.waitForTimeout(3000);
    assert((await n(B.p, "entries")) === 9 && (await n(B.p, "parts")) === 10, "device B received everything after sign-in");

    // B offline: write an entry
    await B.ctx.setOffline(true); await B.p.waitForTimeout(500);
    const pid = await B.p.evaluate(() => window.__fuse.store.all("projects")[0].id);
    await B.p.goto("http://localhost:8080/?emulator" + `#/entry/new?type=build&project=${pid}`); await B.p.waitForTimeout(2500);
    console.log("   B state while offline:", await state(B.p));
    await B.p.fill("#d-title", "Written offline on the phone");
    await B.p.click('[data-act="add"][data-k="measurement"]');
    await B.p.fill('[data-addf="measurement"] [name=value]', "5.02"); await B.p.fill('[data-addf="measurement"] [name=unit]', "V");
    await B.p.click('[data-addf="measurement"] button'); await B.p.waitForTimeout(200);
    await B.p.setInputFiles("[data-photo]", PHOTO); await B.p.waitForTimeout(1500);
    await B.p.click('[data-act="save"]'); await B.p.waitForTimeout(1500);
    assert((await n(B.p, "entries")) === 10, "offline entry saved on device B");
    const st = await state(B.p);
    assert(st === "offline" || st === "pending", "B shows offline/pending: " + st);
    await A.p.waitForTimeout(1500);
    assert((await n(A.p, "entries")) === 9, "device A does not have it yet");
    // reload B while offline: the queued write survives in the persistent cache
    await B.p.reload(); await B.p.waitForTimeout(3000);
    console.log("   B after offline reload: entries", await n(B.p, "entries"), "state", await state(B.p));
    await B.ctx.setOffline(false); await B.p.waitForTimeout(5000);
    await A.p.waitForTimeout(2000);
    const got = await A.p.evaluate(() => window.__fuse.store.all("entries").find((e) => e.title === "Written offline on the phone"));
    assert(!!got, "entry written offline on B appears on A after reconnect");
    assert((await state(B.p)) === "synced", "B back to synced");
    const photo = await A.p.evaluate(async (id) => { const e = window.__fuse.store.all("evidence").find((x) => x.entryId === id && x.kind === "photo"); const bl = e && await window.__fuse.db.getBlob(e.thumbId); return bl ? bl.data.length : 0; }, got.id);
    assert(photo > 500, "photo thumbnail synced through the blobs collection: " + photo + " bytes");

    // Security rules: another signed-in user cannot read Josef's data
    const C = await device(b, "C");
    await C.p.goto("http://localhost:8080/?emulator=mallory&nosw#/home"); await C.p.waitForTimeout(1500);
    await C.p.click('[data-act="signin"]'); await C.p.waitForTimeout(2500);
    assert((await n(C.p, "entries")) === 0, "a different account sees an empty diary");
    const denied = await C.p.evaluate(async () => {
      const fsm = await import("https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js");
      const appm = await import("https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js");
      const db = fsm.getFirestore(appm.getApp());
      try { await fsm.getDocsFromServer(fsm.collection(db, "users", "josef", "entries")); return "read allowed"; } catch (e) { return e.code; }
    });
    assert(denied === "permission-denied", "rules deny reading another user's diary: " + denied);
    console.log([...A.errs, ...B.errs, ...C.errs].join("\n") || "no console errors");
  } catch (e) { console.log(e.message); console.log([...A.errs, ...B.errs].join("\n")); console.log(await A.p.evaluate(() => JSON.stringify({ s: window.__fuse.store.status, n: window.__fuse.store.all("entries").length, info: window.__fuse.db.info }))); await A.p.screenshot({ path: "syncfail.png" }); }
  await b.close();
})();
