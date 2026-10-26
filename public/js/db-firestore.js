// Firestore adapter. Persistent local cache + multi-tab, so writes queue offline and sync on their own.
// Every collection lives under users/{uid}/. Photos live in users/{uid}/blobs and are fetched on demand.

export const SDK = "13.0.0";
const CDN = `https://www.gstatic.com/firebasejs/${SDK}`;

export async function loadFirebase(config) {
  const [appMod, authMod, fs] = await Promise.all([
    import(`${CDN}/firebase-app.js`),
    import(`${CDN}/firebase-auth.js`),
    import(`${CDN}/firebase-firestore.js`),
  ]);
  const app = appMod.initializeApp(config);
  const auth = authMod.getAuth(app);
  const db = fs.initializeFirestore(app, {
    ignoreUndefinedProperties: true,
    localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
  });
  return { app, auth, authMod, db, fs };
}

export function firestoreAdapter(fb, uid, collections) {
  const { db, fs } = fb;
  const base = ["users", uid];
  const unsubs = [];
  const pendingCols = new Set();
  let inflight = 0, error = null, handlers;

  const readKey = `fuse.reads.${new Date().toISOString().slice(0, 10)}`;
  const countReads = (n) => {
    if (!n) return;
    try { localStorage.setItem(readKey, String((+localStorage.getItem(readKey) || 0) + n)); } catch {}
  };

  const status = () => {
    let state = "synced";
    if (error) state = "error";
    else if (!navigator.onLine) state = "offline";
    else if (inflight || pendingCols.size) state = "pending";
    handlers.onStatus({ state, error });
  };

  return {
    kind: "firestore",
    async start(h) {
      handlers = h;
      addEventListener("online", status);
      addEventListener("offline", status);
      await Promise.all(collections.map((col) => new Promise((resolve) => {
        let first = true;
        unsubs.push(fs.onSnapshot(fs.collection(db, ...base, col), { includeMetadataChanges: true }, (snap) => {
          const changed = [], removed = [];
          for (const c of snap.docChanges()) (c.type === "removed" ? removed : changed).push(c.doc.data());
          if (!snap.metadata.fromCache) countReads(snap.docChanges().length);
          snap.metadata.hasPendingWrites ? pendingCols.add(col) : pendingCols.delete(col);
          if (changed.length || removed.length) handlers.onDocs(col, changed, removed);
          status();
          if (first) { first = false; resolve(); }
        }, (e) => { error = e.message; status(); resolve(); }));
      })));
      status();
    },
    async writeMany(list) {
      inflight++; status();
      try {
        for (let i = 0; i < list.length; i += 400) {
          const b = fs.writeBatch(db);
          for (const { col, doc } of list.slice(i, i + 400)) b.set(fs.doc(db, ...base, col, doc.id), doc);
          await b.commit();
        }
        error = null;
      } catch (e) {
        error = e.message || String(e);
        throw e;
      } finally { inflight--; status(); }
    },
    async putBlob(b) {
      const { data, ...rest } = b;
      inflight++; status();
      try { await fs.setDoc(fs.doc(db, ...base, "blobs", b.id), { ...rest, data: fs.Bytes.fromUint8Array(data) }); error = null; }
      catch (e) { error = e.message; throw e; }
      finally { inflight--; status(); }
    },
    async getBlob(id) {
      const s = await fs.getDoc(fs.doc(db, ...base, "blobs", id));
      if (!s.exists()) return null;
      const d = s.data();
      return { ...d, data: d.data.toUint8Array() };
    },
    async allBlobs() {
      const s = await fs.getDocs(fs.collection(db, ...base, "blobs"));
      countReads(s.size);
      return s.docs.map((d) => { const x = d.data(); return { ...x, data: x.data.toUint8Array() }; });
    },
    readsToday: () => { try { return +localStorage.getItem(readKey) || 0; } catch { return 0; } },
    stop() { unsubs.forEach((u) => u()); removeEventListener("online", status); removeEventListener("offline", status); },
  };
}
