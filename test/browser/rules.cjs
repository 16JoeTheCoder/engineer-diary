// Firestore rules test. Needs the emulators: firebase emulators:start --only auth,firestore --project demo-fuse
// Then from the repo root: node test/browser/rules.cjs   (npm i --no-save firebase@13.0.0)
const { initializeApp } = require("firebase/app");
const { getAuth, connectAuthEmulator, signInWithCredential, GoogleAuthProvider } = require("firebase/auth");
const { getFirestore, connectFirestoreEmulator, doc, setDoc, updateDoc, deleteDoc } = require("firebase/firestore");
const assert = (c, m) => { if (!c) throw new Error("FAIL: " + m); console.log("ok  " + m); };
const refused = async (p) => { try { await p; return false; } catch (e) { return /permission/i.test(e.code || e.message); } };
(async () => {
  const app = initializeApp({ apiKey: "demo-key", projectId: "demo-fuse", authDomain: "localhost" });
  const auth = getAuth(app); connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const db = getFirestore(app); connectFirestoreEmulator(db, "127.0.0.1", 8085);
  const { user } = await signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: "rules", email: "rules@example.com", email_verified: true })));
  const u = (col, id) => doc(db, "users", user.uid, col, id);
  const t = new Date().toISOString();
  await setDoc(u("projects", "pactive"), { status: "active", archived: false, updatedAt: t });
  await setDoc(u("projects", "pdone"), { status: "complete", archived: false, updatedAt: t });
  await setDoc(u("files", "f1"), { projectId: "pactive", deletedAt: null, archived: false });
  await setDoc(u("files", "f2"), { projectId: "pdone", deletedAt: null, archived: false });
  await setDoc(u("entries", "e2"), { projectId: "pdone", archived: false });
  assert(await refused(deleteDoc(u("files", "f1"))), "client delete of a file record is refused");
  assert(!(await refused(updateDoc(u("files", "f1"), { deletedAt: t }))), "soft delete allowed under an active project");
  assert(await refused(updateDoc(u("files", "f2"), { deletedAt: t })), "soft delete refused under a completed project");
  assert(await refused(updateDoc(u("entries", "e2"), { archived: true })), "archiving an entry refused under a completed project");
  assert(await refused(deleteDoc(u("entries", "e2"))), "deleting an entry refused under a completed project");
  assert(!(await refused(updateDoc(u("entries", "e2"), { title: "added note" }))), "adding to a completed project still works");
  assert(await refused(updateDoc(u("projects", "pdone"), { archived: true })), "archiving a completed project refused");
  const other = doc(db, "users", "someone-else", "projects", "x");
  assert(await refused(setDoc(other, { a: 1 })), "another user's data is refused");
  console.log("rules: all passed"); process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
