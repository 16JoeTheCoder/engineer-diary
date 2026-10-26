// Service worker: the app opens with no signal.
// App shell: served from cache, refreshed in the background (stale-while-revalidate).
// Firebase SDK from gstatic: cache-first (the URL is versioned). Firestore and auth traffic is never cached here.
const VERSION = "fuse-v1";
const SHELL = [
  "./", "index.html", "manifest.webmanifest", "css/tokens.css", "css/app.css",
  "js/app.js", "js/actions.js", "js/backup.js", "js/config.js", "js/db.js", "js/db-firestore.js", "js/db-local.js", "js/derive.js",
  "js/photos.js", "js/report.js", "js/sample.js", "js/search.js", "js/store.js", "js/ui.js", "js/util.js",
  "js/screens/entry.js", "js/screens/home.js", "js/screens/importer.js", "js/screens/log.js", "js/screens/more.js",
  "js/screens/parts.js", "js/screens/project.js", "js/screens/projects.js", "js/screens/skills.js",
  "import/validate.js", "import/prompt.js", "import/commit.js",
  "assets/fonts/space-grotesk-latin-300-normal.woff2", "assets/fonts/space-grotesk-latin-400-normal.woff2",
  "assets/fonts/space-grotesk-latin-500-normal.woff2", "assets/fonts/space-grotesk-latin-700-normal.woff2",
  "assets/fonts/jetbrains-mono-latin-400-normal.woff2", "assets/fonts/jetbrains-mono-latin-500-normal.woff2", "assets/fonts/jetbrains-mono-latin-700-normal.woff2",
  "assets/logos/tab-small.svg", "assets/icons/favicon.svg", "assets/icons/icon-192.png", "assets/icons/icon-512.png", "assets/icons/maskable-512.png",
];
const SDK = ["firebase-app.js", "firebase-auth.js", "firebase-firestore.js"].map((f) => `https://www.gstatic.com/firebasejs/13.0.0/${f}`);

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(SHELL);
    await Promise.all(SDK.map((u) => c.add(new Request(u, { mode: "cors" })).catch(() => {}))); // optional in local mode
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === "https://www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res; })));
    return;
  }
  if (url.origin !== location.origin || url.pathname.startsWith("/__/")) return; // auth handler, APIs: network only
  e.respondWith((async () => {
    const c = await caches.open(VERSION);
    const key = req.mode === "navigate" ? "index.html" : req;
    const hit = await c.match(key, { ignoreSearch: req.mode === "navigate" });
    const net = fetch(req).then((res) => { if (res.ok && req.mode !== "navigate") c.put(req, res.clone()); if (res.ok && req.mode === "navigate") c.put("index.html", res.clone()); return res; }).catch(() => null);
    return hit || (await net) || new Response("Offline and not cached yet.", { status: 503 });
  })());
});
