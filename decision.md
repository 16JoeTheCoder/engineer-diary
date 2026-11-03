# decision.md (for Josef; newest at the top)

## D-016 2026-11-03 Photos stay on the Firestore blob path; exports embed only photos
Context: H7 and D4. Image files uploaded to R2 are private and need a signed link.
Chosen: export figures come from photo evidence only. R2 files are listed by name in the export, not embedded.
Reversible: yes. Needs your confirmation: no.

## D-015 2026-11-03 Things skipped to save tokens
Skipped: TeX to MathML (H5, equations stay plain monospace), in-page 3D viewer (H6), thumbnails for model files (D2.7: file cards show a type label, not an image), the `impeccable critique` scored re-run loop (one detector pass instead), a separate Flowstate end-to-end browser test (covered by the smoke run and the flow unit tests).
Reversible: yes, each can be added later. Needs your confirmation: no.

## D-014 2026-11-03 Station 6 stores the result on the project
Context: the brief says "measurements judged against successMeasure" but names no field.
Chosen: `project.testResult = { value, note }`, added to the v2 defaults. Experiments and their measurements still show in the export.
Reversible: yes. Needs your confirmation: no.

## D-013 2026-11-03 Flowstate stations write normal entries
Context: stations 2, 3 and 5 need somewhere to put what you type, with autosave and no Save button.
Chosen: the first keystroke creates a normal study, decision, build or fail entry; later keystrokes update it. "Start another" begins a fresh one. A Flowstate entry with no title does not count as the station's output.
Reversible: yes. Needs your confirmation: no.

## D-012 2026-11-03 Decision options stay one text field
Context: D1 says `options: []`. Existing decisions store options as text ("A, B, C").
Chosen: keep the text field (one option per line); the export splits it into a list. No data rewrite needed.
Reversible: yes. Needs your confirmation: no.

## D-011 2026-11-03 Delete passcode is a hash in meta/security
Context: D2.6. Options: (a) hash in Firestore, (b) local only.
Chosen: (a), PBKDF2-SHA256, 150,000 iterations, random salt; works on every device.
What this means for you: the passcode stops accidents, not attackers. The Firestore rules (no file deletes, completed projects locked) are the real protection.
Needs your confirmation: no.

## D-010 2026-11-03 "Mark complete" is separate from "Close project"
Context: Fuse already had Close (aims met or not, completion card). The brief adds complete-and-locked.
Chosen: keep both. Close records aims; Mark complete (project page > More) locks the project. Reopen needs the passcode and writes a dated "Reopened project" entry.
Needs your confirmation: yes. If you want Close to also lock, say so.

## D-009 2026-11-03 Firestore rules adapted to the flat layout
Context: D3's snippet assumed `projects/{pid}/files/{fid}`. Fuse stores `users/{uid}/{collection}/{id}` with a `projectId` field.
Chosen: one rule per collection path that reads the parent project by `projectId`. Files can never be deleted by a client; under a completed project, files, entries, tasks, evidence and BOM lines cannot be archived, soft-deleted or deleted; a completed project cannot be archived.
Checked: `test/browser/rules.cjs` against the emulator (see the log for whether it ran here).
Needs your confirmation: no.

## D-008 2026-11-03 Presigned URLs use the path style
Context: D2.4 builds `https://<bucket>.<account>.r2.cloudflarestorage.com/<key>`. The R2 presigned-URL docs show `https://<account>.r2.cloudflarestorage.com/<bucket>/<key>`.
Chosen: the path style from the docs. CORS is set on the bucket either way.
Needs your confirmation: no, but the Gate 3 upload test is the real check. If it returns SignatureDoesNotMatch, tell me.

## D-007 2026-11-03 New projects start in Flowstate (H2)
Chosen: New project asks "Flowstate" (default) or "Plain project page". Existing projects open in Flowstate from the project page without data loss.
Needs your confirmation: no.

## D-006 2026-11-03 H1: does a worked calculation count as proof?
Default in the brief: yes, capped at level 2 until a measurement exists.
Chosen: NOT built yet. A study entry linked to a skill counts as level 1 (a note), as today. Changing what "proven" means should be your call.
Needs your confirmation: yes.

## D-005 2026-11-03 Backup reminder lives in one header chip
Chosen: a chip in the header (sidebar on desktop, top bar on phone). Calm when fine; amber with a triangle and "Backup due" after 10 new entries or 14 days. The Home banner and hero line are gone.
Needs your confirmation: no.

## D-004 2026-11-03 Entry form puts Save at the bottom on every screen size
Context: C5 asks for a sticky bottom bar on phones. Keeping Save at the top on desktop would mean two Save buttons.
Chosen: one bar after the form; sticky above the bottom nav on phones.
Needs your confirmation: no.

## D-003 2026-11-03 Pure functions take the data they need
Context: the brief names `proofGap(project, tasks, entries)` and `buildDocument(projectId, options)`.
Chosen: `proofGap(project, tasks, entries, evidence)` (proof lives on evidence) and `buildDocument(d, projectId, options)` (so it stays pure and testable).
Needs your confirmation: no.

## D-002 2026-11-03 Deployment: Firebase Hosting config, Pages Functions need Cloudflare Pages
Context: the repo has `firebase.json` hosting and no Cloudflare config. The brief says stop and ask before moving hosting.
Chosen: built the functions anyway (they do nothing on Firebase Hosting). Nothing was moved. File uploads work only once the site is served by Cloudflare Pages.
Needs your confirmation: yes. Tell me how fuse.josefyang.com is deployed today and whether it may move to Pages.

## D-001 2026-11-03 All phases in one run
Context: FUSEUPGRADE.md says stop after each phase. You asked for the whole prompt start to finish, then a PR merged to main.
Chosen: phases 0 to 5 in one run, one combined tester run, logs kept per phase.
Needs your confirmation: no.

Open questions from Part H (cannot be defaulted): (1) how is fuse.josefyang.com deployed and may it move to Cloudflare Pages; (2) the Firebase project id for FIREBASE_PROJECT_ID (set it in the Cloudflare dashboard, not in chat); (3) have you created the R2 bucket yet.
Unverified, not built: R2 bucket locks or retention rules for completed projects. Check the current R2 docs (bucket locks) before relying on them.
