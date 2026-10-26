// IndexedDB adapter: used when no Firebase config is set (local mode) and in tests.
// Same surface as db-firestore.js. Other tabs are told about writes over a BroadcastChannel.

const open = (name) =>
  new Promise((res, rej) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("docs");
      r.result.createObjectStore("blobs");
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });

const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export function localAdapter(dbName = "fuse-local") {
  let idb, handlers, bc;
  const tx = (store, mode = "readonly") => idb.transaction(store, mode).objectStore(store);

  return {
    kind: "local",
    async start(h) {
      handlers = h;
      idb = await open(dbName);
      const keys = await req(tx("docs").getAllKeys());
      const vals = await req(tx("docs").getAll());
      const byCol = {};
      keys.forEach((k, i) => { const col = k.split("/")[0]; (byCol[col] ||= []).push(vals[i]); });
      for (const col in byCol) handlers.onDocs(col, byCol[col]);
      handlers.onStatus({ state: "local" });
      if ("BroadcastChannel" in self) {
        bc = new BroadcastChannel(dbName);
        bc.onmessage = (e) => { for (const { col, doc } of e.data) handlers.onDocs(col, [doc]); };
      }
    },
    async writeMany(list) {
      const t = idb.transaction("docs", "readwrite");
      const s = t.objectStore("docs");
      for (const { col, doc } of list) s.put(doc, `${col}/${doc.id}`);
      await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
      bc?.postMessage(list);
    },
    async putBlob(b) { await req(tx("blobs", "readwrite").put(b, b.id)); },
    async getBlob(id) { return (await req(tx("blobs").get(id))) || null; },
    async allBlobs() { return req(tx("blobs").getAll()); },
    async wipe() { // test harness only, never exposed in the UI
      await req(tx("docs", "readwrite").clear());
      await req(tx("blobs", "readwrite").clear());
    },
    stop() { bc?.close(); idb?.close(); },
  };
}
