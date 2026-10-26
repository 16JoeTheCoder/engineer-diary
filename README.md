<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/assets/logos/tab-lockup-dark.svg">
  <img src="public/assets/logos/tab-lockup-light.svg" alt="builtbyjosef" height="48">
</picture>

# Fuse

**Build small. Prove everything.**

A personal hardware and robotics learning diary. Plan builds with real prices, track every part you own or lost, log typed entries with proof attached, watch skills heat up as proof builds, import AI-drafted plans in one pass, and export a brief an AI turns into a report.

Offline-first PWA. Vanilla JavaScript modules and plain CSS, no build step, no framework. Syncs through Firebase Auth (Google) and Cloud Firestore on the free Spark plan.

## Run it now (local mode, no setup)

While `public/js/config.js` holds `null`, Fuse runs in **local mode**: everything works, data stays in that browser, nothing syncs.

In the **VS Code terminal** (or an Ubuntu/WSL terminal), from the repo folder:

```bash
python -m http.server 8080 --directory public
```

Then open `http://localhost:8080` in Chrome or Edge. Tap **Load sample data** on Home to see the Line-follower v1 project.

## Turn on sync (one time, about 10 minutes)

Do these in the **browser**, at <https://console.firebase.google.com>:

1. **Add project.** Name it `fuse-josef` (any name). Turn Google Analytics off. Stay on the free Spark plan.
2. **Build > Authentication > Get started > Sign-in method > Google > Enable.** Pick your email as support email. Save.
3. **Build > Firestore Database > Create database.** Choose location `asia-southeast2 (Jakarta)`. Start in **production mode**.
4. **Project settings (gear) > General > Your apps > Web (`</>`).** Register an app called `Fuse`. Tick **Also set up Firebase Hosting**. Copy the `firebaseConfig` object it shows.
5. Paste that object into `public/js/config.js` in place of `null` (keep `export const firebaseConfig =`). The config is not a secret; the rules protect the data.
6. Put your project id into `.firebaserc` in place of `your-firebase-project-id`.

Then deploy, in **Windows PowerShell** or the **VS Code terminal**, from the repo folder:

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only hosting,firestore:rules
```

7. **Authentication > Settings > Authorized domains.** `fuse-josef.web.app` and `fuse-josef.firebaseapp.com` are added for you. Add any other domain you serve from.
8. Open `https://<project-id>.web.app` on your Android phone in Chrome: menu **> Add to home screen > Install**. On Windows in Edge or Chrome: the install icon in the address bar.

Moving from local mode to sync: in the local-mode browser, **Settings > Export backup**. After you sign in on the synced app, **Settings > Import backup**. Import merges by id and never overwrites anything newer.

## How it is built

```
public/
  index.html, manifest.webmanifest, sw.js   PWA shell, offline cache
  css/tokens.css                            builtbyjosef tokens (fonts, colours)
  css/app.css                               Fuse styles: heat ramp, fuse, console
  js/db.js                                  the one door to storage (swap the backend here)
  js/db-firestore.js, js/db-local.js        Firestore (persistent cache, multi-tab) and IndexedDB adapters
  js/store.js                               in-memory mirror, writes, undo
  js/derive.js                              skill levels, costs, next action (pure, tested)
  js/actions.js                             lost/restore, purchases, tasks, import, backup
  js/backup.js                              backup format, merge, migrations
  js/report.js                              report brief, Markdown, BOM CSV
  js/search.js                              offline full-text search
  js/screens/*.js                           one module per screen
  import/validate.js, prompt.js, commit.js  fuse.project/1 importer, generator prompt, import/undo
  import/samples/                           sample plans, including a deliberately broken one
firestore.rules                             only the signed-in owner can touch users/{uid}/**
```

Rules worth knowing:

- **Skill levels are computed**, never typed. They are a ladder: 1 a note or resource, 2 a proof (photo, measurement, snippet), 3 proof from a second project, 4 proof on a fail entry with a fix, 5 an entry tagged `taught`. A level never goes down (the peak is stored).
- **Nothing is hard-deleted.** Delete means archive; the Archive screen restores anything. Destructive-looking actions show Undo for 10 seconds.
- **Money** is integer rupiah. A purchase is the only price history. BOM lines from inventory cost Rp 0.
- **Photos** are compressed in the browser (1600 px, about 300 KB, plus a 320 px thumbnail) and stored as Firestore documents in `blobs`, not Cloud Storage (which needs the paid Blaze plan).
- **Schema versioning:** `SCHEMA_VERSION` in `js/backup.js` and `js/store.js`. Add a migration to `MIGRATIONS` for every data change so old backups always import. Export a backup before any risky change.

## Tests

Unit tests (importer, rules, costs, backup merge, import and undo), in the **VS Code terminal**:

```bash
npm test
```

Browser tests drive the real app in Chromium. Start the server first (`npm run serve`), then:

```bash
npm i --no-save playwright axe-core firebase@13.0.0
npx playwright install chromium
node test/browser/e2e.cjs     # lost/restore, proof and levels, import + undo, broken-file errors, backup round trip, search, brief
node test/browser/e2e2.cjs    # phone layout, offline open, purchase entry, close project
node test/browser/axe.cjs     # WCAG 2 AA audit, light and dark
```

Two-device sync test against the Firebase emulators (needs Java):

```bash
firebase emulators:start --only auth,firestore --project demo-fuse   # firestore on port 8085
node test/browser/sync.cjs
```

`?local` in the URL forces a separate local test database; `?emulator` points the app at the local emulators; `?nosw` skips the service worker.

## Design

Fuse deliberately overrides the calm rules of the [builtbyjosef design system](https://github.com/16JoeTheCoder/builtbyjosef-designsystem): gradients, glow and a heat ramp are allowed because **heat is data**. Colour always means how much proof, progress or energy something carries. Kept from the system: Space Grotesk 300/400/500/700 and JetBrains Mono, the wordmark and JY tab, sentence case, verb-first buttons, no emoji, no exclamation marks, `2026-10-26` dates, SI units.

Code is MIT. Fonts are SIL OFL 1.1. Logos, the builtbyjosef name and the JY monogram are all rights reserved.
