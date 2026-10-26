// Accessibility audit (WCAG 2 AA) of every screen in both themes. Needs: npm i --no-save axe-core playwright
const setup = require("./setup.cjs");
const fs = require("fs");
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
(async () => {
  for (const scheme of ["light", "dark"]) {
    const { b, p, pid, go, errs } = await setup({ ctx: { colorScheme: scheme, reducedMotion: "reduce" } });
    for (const r of ["home", "projects", `p/${pid}`, "parts", "parts?tab=lost", "skills", `entry/new?type=fail&project=${pid}`, "log", "import", "settings", "library", "archive"]) {
      await go(r, 500);
      await p.addScriptTag({ content: AXE });
      const res = await p.evaluate(async () => (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa"], resultTypes: ["violations"] })).violations.map((v) => ({ id: v.id, n: v.nodes.length, ex: v.nodes.slice(0, 3).map((x) => x.target.join(" ") + " :: " + (x.any[0]?.message || x.failureSummary).slice(0, 140)) })));
      if (res.length) console.log(`[${scheme}] ${r}:`, JSON.stringify(res, null, 1));
    }
    if (errs.length) console.log(errs);
    await b.close();
  }
  console.log("done");
})();
