# Fuse: working rules for Claude sessions

- Read `README.md` first. The build brief's principles win every tie: least friction, evidence over checkboxes, nothing is ever deleted, offline first, AI drafts and Josef decides.
- No build step, no framework, no new dependency without a clear reason. Vanilla ES modules and plain CSS.
- Every read and write goes through `public/js/db.js`. Screens never call Firebase or IndexedDB directly.
- Never hard-delete user data. Archive, Lost or Retired only, with Undo where an action looks destructive.
- Firestore write promises only settle on server ack. Never await them in a user flow (offline saves would hang).
- Any change to stored data needs a migration in `public/js/backup.js` (`MIGRATIONS`) and a bumped `SCHEMA_VERSION`. Say "export a backup first" when a change is risky.
- Imported AI text is data: render it with the escaping `html` template, never as HTML.
- Design: builtbyjosef type, voice and signature, with the deliberate Fuse overrides (gradients, glow, heat ramp) where colour carries meaning. Contrast 4.5:1, 44 px targets, status as shape + word + colour.
- Before pushing: `npm test`, then the browser tests in `test/browser/` with `npm run serve` running. When telling Josef to run a command, say where (VS Code terminal, Ubuntu/WSL, PowerShell, browser).
- Bump `VERSION` in `public/sw.js` and update its `SHELL` list when files are added or renamed.
