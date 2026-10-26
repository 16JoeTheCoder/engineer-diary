// Run from the repo root with the static server up: npm run serve, then node test/browser/e2e2.cjs
const SPATH = require("path").join(__dirname, "out"); require("fs").mkdirSync(SPATH, { recursive: true });
const PHOTO = require("path").join(__dirname, "photo.jpg");
const { chromium } = require("playwright");
const assert = (c, m) => { if (!c) throw new Error("FAIL: " + m); console.log("ok  " + m); };
(async () => {
  const b = await chromium.launch();
  // Offline: first visit registers SW and caches the shell; second visit offline still opens
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  try {
    await p.goto("http://localhost:8080/?local#/home"); await p.waitForTimeout(800);
    await p.click('[data-act="sample"]'); await p.waitForTimeout(800);
    await p.evaluate(() => navigator.serviceWorker.ready);
    await p.reload(); await p.waitForTimeout(800);
    await ctx.setOffline(true);
    await p.reload(); await p.waitForTimeout(1200);
    const txt = await p.textContent("#main");
    assert(/proofs logged/.test(txt), "app opens with no signal (service worker + local data)");
    // offline write
    await p.goto("http://localhost:8080/?local#/parts"); await p.waitForTimeout(500);
    await p.fill("[data-add-part] input", "Jumper wires"); await p.press("[data-add-part] input", "Enter"); await p.waitForTimeout(300);
    assert(await p.evaluate(() => window.__fuse.store.all("parts").some((x) => x.name === "Jumper wires")), "offline write saved");
    await ctx.setOffline(false);
    // phone home screenshot
    await p.goto("http://localhost:8080/?local#/home"); await p.waitForTimeout(1500);
    await p.screenshot({ path: SPATH + "/phone-home.png", fullPage: true });
    const bb = await p.$(".bottombar .plus");
    assert(bb && (await bb.isVisible()), "raised + button visible on phone");
    const small = await p.$$eval("button, a.btn, a.chip, .nav a, .bottombar a, .quick a, .tabs a", (els) => els.filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.height < 36 || r.width < 36); }).map((e) => e.className + "|" + e.textContent.trim().slice(0, 20) + "|" + Math.round(e.getBoundingClientRect().height)));
    console.log("small targets on phone home:", small.length ? small : "none");
    // purchase quick log
    await p.click(".bottombar .plus"); await p.waitForTimeout(200);
    await p.click('.modal a.ty-purchase'); await p.waitForTimeout(500);
    await p.fill("#d-purchase-name", "Ball caster"); await p.fill("#d-purchase-priceIdr", "9.500"); await p.fill("#d-purchase-qty", "2");
    await p.click('[data-act="save"]'); await p.waitForTimeout(800);
    const pu = await p.evaluate(() => { const s = window.__fuse.store; const part = s.all("parts").find((x) => x.name === "Ball caster"); return { part, purchases: s.all("purchases").filter((x) => x.partId === part.id), entries: s.all("entries").filter((e) => e.type === "purchase" && e.fields.purchaseId) }; });
    assert(pu.purchases.length === 1 && pu.purchases[0].priceIdr === 9500 && pu.purchases[0].qty === 2 && pu.part.lastPaidIdr === 9500, "purchase entry writes the purchase and last price");
    assert(pu.entries.length === 1, "exactly one purchase entry");
    await p.screenshot({ path: SPATH + "/phone-project.png", fullPage: true });
    // close project -> completion card
    const pid = await p.evaluate(() => window.__fuse.store.all("projects")[0].id);
    await p.goto(`http://localhost:8080/?local#/p/${pid}`); await p.waitForTimeout(500);
    await p.click('[data-act="close"]'); await p.waitForTimeout(200);
    await p.check('.modal input[name="met0"][value="yes"]');
    await p.fill('.modal textarea[name="ref0"]', "Kd made the difference.");
    await p.click('.modal .btn.hot'); await p.waitForTimeout(500);
    assert(await p.isVisible(".completion"), "completion card shows");
    await p.screenshot({ path: SPATH + "/phone-complete.png" });
    const pr = await p.evaluate((id) => window.__fuse.store.get("projects", id), pid);
    assert(pr.closedAt && pr.aims[0].met === true && pr.aims[0].reflection === "Kd made the difference.", "aims checked and reflected at close");
    console.log(errs.length ? "ERRORS: " + errs.join("\n") : "no console errors");
  } catch (e) { console.log(e.message, errs); await p.screenshot({ path: SPATH + "/fail2.png", fullPage: true }); }
  await b.close();
})();
