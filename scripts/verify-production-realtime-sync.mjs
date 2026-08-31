import { randomBytes } from "node:crypto";
import { deleteApp, initializeApp } from "firebase/app";
import { getAuth, signInWithCustomToken, signOut } from "firebase/auth";
import { get, getDatabase, ref, remove, set } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyCZK3HSQwhAZI1T3AzjBVBBAFqtC8xMy28",
  authDomain: "lighthouse-bf85b.firebaseapp.com",
  databaseURL: "https://lighthouse-bf85b-default-rtdb.firebaseio.com",
  projectId: "lighthouse-bf85b",
  appId: "1:761425323084:web:09e76b68e9e115377f80e9",
};

const response = await fetch("https://www.lighthousemoshi.com/api/auth/pin", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ role: "cashier", password: "1234" }),
});
const payload = await response.json().catch(() => ({}));
if (!response.ok || typeof payload.token !== "string") {
  throw new Error(`Production staff authentication failed (${response.status}).`);
}

const app = initializeApp(firebaseConfig, `lighthouse-production-sync-${Date.now()}`);
const auth = getAuth(app);
const database = getDatabase(app);
const verificationId = randomBytes(12).toString("hex");
const verificationRef = ref(database, `lighthouse-v1/lighthouse-sync-verification/${verificationId}`);

try {
  const credential = await signInWithCustomToken(auth, payload.token);
  const token = await credential.user.getIdTokenResult();
  if (token.claims.role !== "cashier") throw new Error("Production token is missing the cashier role claim.");

  const expected = { verifiedAt: Date.now(), client: "firebase-web-sdk" };
  await set(verificationRef, expected);
  const snapshot = await get(verificationRef);
  if (!snapshot.exists() || snapshot.val()?.client !== expected.client) {
    throw new Error("Production Realtime Database write could not be read back.");
  }
  await remove(verificationRef);
  const removedSnapshot = await get(verificationRef);
  if (removedSnapshot.exists()) throw new Error("Production sync verification cleanup failed.");

  console.log("Production cashier authentication and Realtime Database read/write synchronization verified.");
} finally {
  await remove(verificationRef).catch(() => undefined);
  await signOut(auth).catch(() => undefined);
  await deleteApp(app).catch(() => undefined);
}
