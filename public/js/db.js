// The one door to storage. Screens never talk to Firebase or IndexedDB directly,
// so the backend can be swapped by changing this file and an adapter.
import { firebaseConfig } from "./config.js";
import { localAdapter } from "./db-local.js";

export const COLLECTIONS = [
  "tracks", "projects", "parts", "bomLines", "purchases", "entries", "evidence",
  "skills", "domains", "resources", "settings", "tasks", "importBatches",
];

let adapter = null, fb = null, handlers = null;
export const info = { mode: firebaseConfig ? "firestore" : "local", user: null, sdkError: null };

// handlers: onDocs(col, docs, removedIds), onStatus(status), onAuth(user|null)
export async function init(h) {
  handlers = h;
  const forceLocal = new URLSearchParams(location.search).has("local");
  if (!firebaseConfig || forceLocal) {
    info.mode = "local";
    adapter = localAdapter(forceLocal ? "fuse-test" : "fuse-local");
    await adapter.start(handlers);
    handlers.onAuth({ local: true });
    return;
  }
  try {
    const { loadFirebase } = await import("./db-firestore.js");
    fb = await loadFirebase(firebaseConfig);
  } catch (e) {
    info.sdkError = e.message || String(e);
    handlers.onStatus({ state: "error", error: "Could not load the sync library. Connect once so it can be cached." });
    handlers.onAuth(null);
    return;
  }
  fb.authMod.onAuthStateChanged(fb.auth, async (user) => {
    adapter?.stop();
    adapter = null;
    info.user = user ? { uid: user.uid, name: user.displayName, email: user.email } : null;
    if (user) {
      const { firestoreAdapter } = await import("./db-firestore.js");
      adapter = firestoreAdapter(fb, user.uid, COLLECTIONS);
      handlers.onReset?.();
      await adapter.start(handlers);
    }
    handlers.onAuth(info.user);
  });
}

export async function signIn() {
  const { authMod, auth } = fb;
  const provider = new authMod.GoogleAuthProvider();
  try { await authMod.signInWithPopup(auth, provider); }
  catch (e) {
    if (/popup-blocked|operation-not-supported/.test(e.code || "")) await authMod.signInWithRedirect(auth, provider);
    else throw e;
  }
}
export const signOut = () => fb && fb.authMod.signOut(fb.auth);

const need = () => { if (!adapter) throw new Error("Not signed in"); return adapter; };
export const writeMany = (list) => need().writeMany(list);
export const putBlob = (b) => need().putBlob(b);
export const getBlob = (id) => need().getBlob(id);
export const allBlobs = () => need().allBlobs();
export const readsToday = () => adapter?.readsToday?.() ?? 0;
export const wipeLocal = () => adapter?.wipe?.(); // test harness only
