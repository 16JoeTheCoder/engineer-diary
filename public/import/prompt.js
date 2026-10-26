// The generator prompt behind "Copy prompt". The schema version lives here and in validate.js.
export const SCHEMA_VERSION = "fuse.project/1";

export const GENERATOR_PROMPT = `You are a hardware project planner for a beginner in Indonesia who builds robotics and electronics projects with a small budget and parts bought on Shopee or Tokopedia. Plan the project below and answer with ONE JSON object in the ${SCHEMA_VERSION} format. Output the JSON only, with no text before or after it.

PROJECT: [describe the project in one or two sentences]
BUDGET CAP (IDR): [number]
MY LEVEL: [beginner / some experience]
CONTEXT: [parts I own, tools, time per week; or leave blank]

FORMAT
{"schema":"${SCHEMA_VERSION}","project":{"name","track","summary","budgetCapIdr","aims":[],"nextAction"},"parts":[{"ref","name","category","qty","priceIdr","searchQuery","purpose","owned"}],"tasks":[{"ref","stage","title","detail","estMinutes","partRefs":[],"skills":[],"proof":[],"dependsOn":[]}],"skills":[{"name","domain","why"}],"resources":[{"title","type","note"}],"risks":[{"text","mitigation"}]}

RULES
1. Output valid JSON only. No comments, no trailing commas.
2. Use "${SCHEMA_VERSION}" as the schema value.
3. Prices are whole Indonesian rupiah estimates, or null when you are not sure. Never invent an exact price.
4. Do not invent links. Give a searchQuery instead (the words to type into Shopee).
5. At most 25 parts and 40 tasks. Every ref is unique, short and lowercase (p1, t1).
6. If CONTEXT lists parts I own, reuse them with "owned": true and price 0 or null.
7. Tasks are small: 5 to 90 minutes each, ordered, one outcome each. Put the hard-to-undo steps last.
8. stage is one of plan, order, build, test, document. Cover every stage, and always include at least one test task and one document task.
9. proof is any of photo, measurement, snippet, note, and says what I should capture to show I did the task.
10. Prefer skill names from this list when they fit, and add new ones only when needed: [SKILLS].
11. Before any task involving lithium cells, mains power or soldering, add a safety check task with the exact check (for example, check polarity with the multimeter).
12. Do not invent specifications. When unsure, say so in detail and add a task to read the datasheet.
13. Plain English, short sentences, no jargon without a one-line explanation.
14. Keep the whole project finishable by a beginner within the budget cap. If it cannot be done, say so in risks and offer the nearest smaller version.`;

// skills: [{name, level}], parts: [{name, qty, status}], budget: number
export function buildPrompt({ skills = [], parts = [], budget = null, includeContext = false } = {}) {
  const names = skills.map((s) => s.name).join(", ") || "none yet";
  let out = GENERATOR_PROMPT.replace("[SKILLS]", names);
  if (includeContext) {
    out += "\n\nMY INVENTORY AND SKILLS (use this as CONTEXT)\n" + contextBlock({ skills, parts, budget });
  }
  return out;
}

// Kept under about 3 KB: owned parts (spare and in use) by name and quantity, skills with levels, default budget.
export function contextBlock({ skills = [], parts = [], budget = null }, maxBytes = 3000) {
  const owned = parts.filter((p) => ["spare", "in_use", "tested", "arrived"].includes(p.status));
  const lines = [];
  if (budget) lines.push(`Default budget: ${budget} IDR`);
  lines.push("Parts I own:");
  const partLines = owned.map((p) => `- ${p.name} x${p.qty}${p.status === "in_use" ? " (in use)" : ""}`);
  const skillLines = skills.map((s) => `- ${s.name}: level ${s.level}/5`);
  let size = lines.join("\n").length + 20;
  const take = (arr, limit) => { const out = []; for (const l of arr) { if (size + l.length + 1 > limit) break; out.push(l); size += l.length + 1; } return out; };
  const pl = take(partLines, maxBytes - 400); // leave room for the skills section
  lines.push(...(pl.length ? pl : ["- none"]));
  if (pl.length < partLines.length) lines.push(`- and ${partLines.length - pl.length} more`);
  lines.push("My skills:");
  const sl = take(skillLines, maxBytes - 20);
  lines.push(...(sl.length ? sl : ["- none yet"]));
  return lines.join("\n");
}
