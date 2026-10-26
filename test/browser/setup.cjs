const { chromium } = require("playwright");
module.exports = async function setup(opts = {}) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: opts.viewport || { width: 1360, height: 900 }, ...(opts.ctx || {}) });
  const p = await ctx.newPage();
  const errs = [];
  p.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });
  p.on("pageerror", (e) => errs.push("pageerror: " + e.message + "\n" + e.stack));
  const base = "http://localhost:8080/?local&nosw";
  await p.goto(base + "#/home"); await p.waitForTimeout(600);
  if (opts.sample !== false) { await p.click('[data-act="sample"]'); await p.waitForTimeout(800); }
  const pid = await p.evaluate(() => window.__fuse.store.all("projects")[0]?.id);
  const go = async (h, w = 400) => { await p.goto(base + "#/" + h); await p.waitForTimeout(w); };
  return { b, ctx, p, errs, pid, go, base };
};
