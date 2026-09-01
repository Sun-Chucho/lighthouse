import { getApp, getApps, initializeApp } from "firebase/app";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";
import { browserLocalPersistence, getAuth, setPersistence, signInWithCustomToken } from "firebase/auth";
import { getDatabase } from "firebase/database";
import type { Role } from "@/app/lib/mock-data";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "AIzaSyCZK3HSQwhAZI1T3AzjBVBBAFqtC8xMy28",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "lighthouse-bf85b.firebaseapp.com",
  databaseURL:
    process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ??
    "https://lighthouse-bf85b-default-rtdb.firebaseio.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "lighthouse-bf85b",
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "lighthouse-bf85b.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "761425323084",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "1:761425323084:web:09e76b68e9e115377f80e9",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? "G-DT6R12MN5D",
};

const measurementId =
  process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? "G-DT6R12MN5D";

export const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const firebaseDatabase = getDatabase(firebaseApp);

let authReadyPromise: Promise<void> | null = null;
export function ensureFirebaseAuthReady() {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  if (!authReadyPromise) {
    authReadyPromise = (async () => {
      try {
        await setPersistence(firebaseAuth, browserLocalPersistence);
      } catch {
        // Fall back to the default auth persistence if the environment blocks local persistence.
      }

      // Firebase restores persisted users asynchronously. Reading currentUser
      // before restoration completed made the first POS realtime subscription
      // fail permanently on some reloads.
      await firebaseAuth.authStateReady();
      if (firebaseAuth.currentUser) {
        return;
      }

      throw new Error("A verified Lighthouse staff session is required for operational synchronization.");
    })().catch((error) => {
      authReadyPromise = null;
      throw error;
    });
  }

  return authReadyPromise;
}

let staffAuthenticationPromise: ReturnType<typeof authenticateStaffWithPin> | null = null;

export async function ensureStaffCloudAuthentication(role: Role, password: string) {
  if (typeof window === "undefined" || !window.navigator.onLine) return null;

  await firebaseAuth.authStateReady();
  const currentUser = firebaseAuth.currentUser;
  if (currentUser && !currentUser.isAnonymous) {
    const token = await currentUser.getIdTokenResult();
    if (token.claims.role === role || token.claims.staffRole === role) return currentUser;
  }

  if (!staffAuthenticationPromise) {
    staffAuthenticationPromise = authenticateStaffWithPin(role, password)
      .finally(() => {
        staffAuthenticationPromise = null;
      });
  }

  return staffAuthenticationPromise;
}

export async function authenticateStaffWithPin(role: Role, password: string) {
  if (typeof window === "undefined" || !window.navigator.onLine) return null;

  if (window.lighthouseDesktop) {
    const token = await window.lighthouseDesktop.authenticateStaff(role, password);
    await setPersistence(firebaseAuth, browserLocalPersistence);
    return signInWithCustomToken(firebaseAuth, token);
  }

  const apiOrigin = "";
  const response = await fetch(`${apiOrigin}/api/auth/pin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, password }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Cloud role verification failed.");

  const payload = (await response.json()) as { token?: string };
  if (!payload.token) throw new Error("Cloud role verification did not return a Firebase token.");
  await setPersistence(firebaseAuth, browserLocalPersistence);
  return signInWithCustomToken(firebaseAuth, payload.token);
}

let analyticsPromise: Promise<Analytics | null> | null = null;

export function getFirebaseAnalytics() {
  if (typeof window === "undefined" || !measurementId) {
    return Promise.resolve<Analytics | null>(null);
  }

  if (!analyticsPromise) {
    analyticsPromise = isSupported()
      .then((supported) => (supported ? getAnalytics(firebaseApp) : null))
      .catch(() => null);
  }

  return analyticsPromise;
}

export { firebaseConfig, measurementId };
