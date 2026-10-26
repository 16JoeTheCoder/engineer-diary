// The one door to storage. Screens never talk to Firebase or IndexedDB directly,
// so the backend can be swapped by changing this file and an adapter.
import { firebaseConfig } from "./config.js";
import { localAdapter } from "./db-local.js";

export const COLLECTIONS = [
  "tracks", "projects", "parts", "bomLines", "purchases", "entries", "evidence",
  "skills", "domains", "resources", "settings", "tasks", "importBatches",
];

let adapter = null, fb = null, handlers = null;
// ?emulator runs against the local Firebase emulators (auth :9099, firestore :8085) for testing.
const params = new URLSearchParams(location.search);
const emulator = params.has("emulator");
const config = emulator ? (firebaseConfig || { apiKey: "demo-key", projectId: "demo-fuse", authDomain: "localhost" }) : firebaseConfig;
export const info = { mode: config ? "firestore" : "local", user: null, sdkError: null, emulator };

// handlers: onDocs(col, docs, removedIds), onStatus(status), onAuth(user|null)
export async function init(h) {
  handlers = h;
  const forceLocal = params.has("local");
  if (!config || forceLocal) {
    info.mode = "local";
    adapter = localAdapter(forceLocal ? "fuse-test" : "fuse-local");
    await adapter.start(handlers);
    handlers.onAuth({ local: true });
    return;
  }
  try {
    const { loadFirebase } = await import("./db-firestore.js");
    fb = await loadFirebase(config, emulator);
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
  if (emulator) { // the auth emulator accepts an unsigned Google credential
    const who = params.get("emulator") || "josef";
    return authMod.signInWithCredential(auth, authMod.GoogleAuthProvider.credential(JSON.stringify({ sub: who, email: `${who}@example.com`, email_verified: true })));
  }
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
