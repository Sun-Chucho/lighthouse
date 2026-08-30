import { deleteApp as deleteClientApp, initializeApp } from "firebase/app";
import { randomBytes } from "node:crypto";
import {
  inMemoryPersistence,
  initializeAuth,
  signInAnonymously,
  signInWithEmailAndPassword,
} from "firebase/auth";
import {
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setLogLevel,
  setDoc,
  terminate as terminateClientFirestore,
} from "firebase/firestore";
import { deleteApp as deleteAdminApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import {
  adminFirestore,
  firebaseAdminApp,
  firebaseProjectId,
} from "../server/firebase-admin.mjs";

const clientApp = initializeApp({
  apiKey: "AIzaSyCZK3HSQwhAZI1T3AzjBVBBAFqtC8xMy28",
  authDomain: "lighthouse-bf85b.firebaseapp.com",
  projectId: "lighthouse-bf85b",
  appId: "1:761425323084:web:09e76b68e9e115377f80e9",
}, `lighthouse-client-sync-check-${Date.now()}`);
const clientAuth = initializeAuth(clientApp, { persistence: inMemoryPersistence });
const clientDatabase = getFirestore(clientApp);
setLogLevel("silent");
const documentId = `sync-check-${Date.now()}`;
let guestUid = null;
let staffUid = null;
let staffEmail = null;

async function withNetworkRetry(operation) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const code = String(error?.code ?? "");
      const retryable = code.includes("network-request-failed")
        || code.includes("unavailable")
        || code.includes("deadline-exceeded");
      if (!retryable || attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
  throw lastError;
}

try {
  const credential = await withNetworkRetry(() => signInAnonymously(clientAuth));
  guestUid = credential.user.uid;

  const bookingReference = doc(clientDatabase, "bookingEnquiries", documentId);
  await setDoc(bookingReference, {
    guestUid,
    guestName: "Lighthouse Sync Check",
    email: "sync-check@example.invalid",
    phone: "00000",
    checkIn: "2099-01-01",
    checkOut: "2099-01-02",
    guests: 1,
    roomType: "either",
    note: "Automated rule verification; removed immediately.",
    status: "pending",
    source: "web",
    clientCreatedAt: new Date().toISOString(),
    createdAt: serverTimestamp(),
  });

  const snapshot = await getDoc(bookingReference);
  if (!snapshot.exists() || snapshot.data().guestUid !== guestUid) {
    throw new Error("Anonymous booking inquiry could not be read by its owner.");
  }

  let forbiddenWriteDenied = false;
  try {
    await setDoc(doc(clientDatabase, "restrictedSyncChecks", documentId), { guestUid });
  } catch (error) {
    forbiddenWriteDenied = error?.code === "permission-denied";
  }
  if (!forbiddenWriteDenied) {
    throw new Error("The default-deny Firestore rule did not reject a restricted write.");
  }

  const adminAuth = getAdminAuth(firebaseAdminApp);
  staffEmail = `sync-check-${randomBytes(12).toString("hex")}@example.invalid`;
  const staffPassword = randomBytes(18).toString("base64url");
  let staffUser;
  try {
    staffUser = await adminAuth.createUser({ email: staffEmail, password: staffPassword });
  } catch (error) {
    if (error?.code !== "auth/email-already-exists") throw error;
    staffUser = await adminAuth.getUserByEmail(staffEmail);
  }
  staffUid = staffUser.uid;
  await adminAuth.setCustomUserClaims(staffUid, { role: "manager" });

  const staffCredential = await withNetworkRetry(
    () => signInWithEmailAndPassword(clientAuth, staffEmail, staffPassword),
  );
  const staffToken = await staffCredential.user.getIdTokenResult();
  if (staffToken.claims.role !== "manager") {
    throw new Error("Email/Password staff role claims could not be verified.");
  }
  const staffRead = await getDoc(bookingReference);
  if (!staffRead.exists()) {
    throw new Error("A verified Manager could not read the booking inquiry.");
  }

  console.log(`Anonymous Authentication verified for project: ${firebaseProjectId}`);
  console.log("Email/Password Authentication and staff role claims verified.");
  console.log("Booking inquiry create/read rules verified.");
  console.log("Default-deny Firestore protection verified.");
} catch (error) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "unknown";
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Client synchronization verification failed (${code}): ${message}`);
  process.exitCode = 1;
} finally {
  await terminateClientFirestore(clientDatabase).catch(() => undefined);
  await adminFirestore.doc(`bookingEnquiries/${documentId}`).delete().catch(() => undefined);
  const residualDocument = await adminFirestore.doc(`bookingEnquiries/${documentId}`).get().catch(() => null);
  if (residualDocument?.exists) {
    console.error("Verification cleanup could not remove its booking document.");
    process.exitCode = 1;
  }
  if (guestUid) {
    await getAdminAuth(firebaseAdminApp).deleteUser(guestUid).catch(() => undefined);
  }
  if (staffUid) {
    await getAdminAuth(firebaseAdminApp).deleteUser(staffUid).catch(() => undefined);
  } else if (staffEmail) {
    const adminAuth = getAdminAuth(firebaseAdminApp);
    const unresolvedUser = await adminAuth.getUserByEmail(staffEmail).catch(() => null);
    if (unresolvedUser) await adminAuth.deleteUser(unresolvedUser.uid).catch(() => undefined);
  }
  await deleteClientApp(clientApp).catch(() => undefined);
  await adminFirestore.terminate().catch(() => undefined);
  await deleteAdminApp(firebaseAdminApp).catch(() => undefined);
}
