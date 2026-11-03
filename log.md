# log.md (agent memory; append only; newest at the bottom)

## 2026-11-03 Phase 0, steps 1 to 5
Did: created log.md, decision.md, PRODUCT.md; .gitignore now ignores `.dev.vars*` and `.env*` (node_modules/ was already there).
Checked: npm test pass (baseline, 3 files).
Next: map below, then Phase 1. Josef asked for all phases in one run (decision D-001).
Blockers: none.

### Map (Phase 0, step 3)
- Storage: flat per-user collections `users/{uid}/{col}/{id}` (Firestore) or IndexedDB `docs` store keyed `col/id`. Blobs in `users/{uid}/blobs`.
- Collections (`js/db.js` COLLECTIONS): tracks, projects, parts, bomLines, purchases, entries, evidence, skills, domains, resources, settings, tasks, importBatches.
- Every doc: id, createdAt, updatedAt, archived. Settings is one doc `settings/main`.
- SCHEMA_VERSION = 1 in `js/backup.js` and `js/store.js`; MIGRATIONS empty.
- `report.js`: briefMarkdown (project brief), reportBrief (AI role prompt + brief), projectMarkdown (brief + diary + tasks), bomCsv. No HTML, no zip.
- Router: `app.js route()` splits `#/name/id?query`; SCREENS map by name; screens export {render, mount, acts, title, dark}. `#/entry/new?type=&project=&task=` builds a localStorage draft in `screens/entry.js`.
- Deploy: `firebase.json` has Firebase Hosting (public/). No wrangler config, no workflows, no _headers. So the live site is on Firebase Hosting (or a manual Pages upload Josef did; unknown). Pages Functions need Cloudflare Pages (D-002).
- Tests: `npm test` (node --test test/*.test.js); browser: test/browser/e2e.cjs, e2e2.cjs, axe.cjs, sync.cjs (emulator).
- F1 `css/app.css` `.stat .v` (nowrap + ellipsis) and home.js Spent stat.
- F2 `screens/more.js` library render.
- F3 `--hot`/`--hot-v` used by .btn.hot, .btn.primary::before, .next-card, .grad-text, .bottombar .plus, .tabs, .nav, rungs, task tick, step.ok, meter, completion.
- F4 `screens/home.js` (banners + hero sub + side foot = three backup prompts; Last entry block).
- F5 `screens/entry.js` TEMPLATES and the save button in page-h.
- F6 `screens/parts.js` row(): Lost button per row; `.tabs` overflow hidden scrollbar.
- F7 `screens/more.js` settings Sync section mentions js/config.js.
- F8 `.btn.s` 36 px, `.chip` 30 px, `.search-field kbd` 11 px, `.chip .lv` 11 px, `.bottombar a` 11 px, `.fuse.mini .node` 10 px.
- F9 home.js has no proof gap line; NEEDS PROOF only in project.js taskRow.

### Phase 0, step 4: causes
- F1 cause: `.stat .v` has `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` and the stat grid column is 150 px min, so "Rp 201.000" at 28 px clips. Fix: drop ellipsis, allow wrap, clamp size, tabular nums, `formatRp(n,{compact})` swapped by a container query.
- F2 cause: resources DO render (2 in the sample), but each row is an always-open edit form (type select, three bare inputs, all nine skill chips). With values inside inputs, the page reads as two duplicate empty forms: the "chips twice" are the per-row skill chips. Fix: read-only list rows with an Edit disclosure; add form behind a button; type and skill chips once as filters.

## 2026-11-03 Phase 1 (F1, F2, backup safety)
Did: formatRp + moneyHtml (container query swaps full/compact; no ellipsis); Library rebuilt as a read-only list with filters once, Edit dialog, collapsed add form, empty state; entriesSinceBackup counter, backupState(), header chip (one place), checkBackup() dry run in Settings.
Checked: npm test pass; smoke at 525 and 1280: 0 truncated money values.
Blockers: none.

## 2026-11-03 Phase 2 (calm; impeccable quieter/colorize/typeset/layout/distill/clarify/adapt)
Did: --action/--action-ink; gradients only on heat tokens and data selectors; glow removed; type tiles neutral with 3 px marker; Home rebuilt (next action first, proof gap F9, skills line, 16-week strip with numbered/pattern legend, empty Home with three buttons); entry form C5 (one prompt field, Add detail remembered per type, near skills + All skills, sticky save bar, Save disabled until title); Parts overflow menu and wrapping tabs (F6); Settings sync text collapsed (F7); 13 px floor and 44 px targets (F8).
Checked: grep gradient (data only); grep font-size (none under 13); next action bottom at 286 px of 547; small targets left: brand link 28 px tall (not a control), backup chip 42 px wide on phone.
Next: Phase 3.

## 2026-11-03 Phase 3 (schema v2, vault, R2)
Did: SCHEMA_VERSION 2 in backup.js and store.js; MIGRATIONS[1] fills project defaults, adds files/meta (idempotent); live upgrade in reconcilePeaks; study and design types; decision changeMyMind; sectionOf; Notebook on project page; functions/api upload-url, file-verify, file-url, health + edge-lib auth/r2; files.js (XHR progress, cancel, retry, failed list); passcode (PBKDF2); soft delete; Mark complete + lock + reopen with passcode; rules rewritten for flat layout; docs/BACKUP-R2.md; README.
Checked: npm test pass incl. edge tests (buildKey, safeName, requireUser missing/expired/aud/allow-list).
Blockers: hosting is Firebase (D-002); real R2 test needs Josef (Gate 3).

## 2026-11-03 Phase 4 (Flowstate)
Did: flow.js (stations, nextStation, canSkip, stationOutputPresent, leaveStation, resumeLine, verdict, assembleWriteup, stuckPrompt); screens/flow.js at #/flow/<id> with autosave 600 ms, Park it, Stuck?, resume line, 7-dot row (ring for later); entry points on Home, Projects, project page, New project.
Checked: unit tests; smoke: autosave survived reload (after fixing statement saved to the wrong field), skip marks later.

## 2026-11-03 Phase 5 (export)
Did: export.js buildDocument, export-md.js, export-html.js (light, print CSS A4 18 mm, fonts embedded at export), zip.js (store-only, CRC-32), screens/export.js review screen; golden files in test/golden.
Checked: golden tests, zip parse + CRC, HTML escaping, no external src, print CSS without fills.
Next: tester run, then PR.
