import type { Analytics } from "firebase/analytics";
import { getApp, getApps, initializeApp } from "firebase/app";
import type { Firestore } from "firebase/firestore";

export const firebaseConfig = {
  apiKey: "AIzaSyCZK3HSQwhAZI1T3AzjBVBBAFqtC8xMy28",
  authDomain: "lighthouse-bf85b.firebaseapp.com",
  databaseURL: "https://lighthouse-bf85b-default-rtdb.firebaseio.com",
  projectId: "lighthouse-bf85b",
  storageBucket: "lighthouse-bf85b.firebasestorage.app",
  messagingSenderId: "761425323084",
  appId: "1:761425323084:web:09e76b68e9e115377f80e9",
  measurementId: "G-DT6R12MN5D",
} as const;

export const firebaseApp = getApps().length > 0
  ? getApp()
  : initializeApp(firebaseConfig);

let analyticsInitialization: Promise<Analytics | null> | undefined;
let firestoreInitialization: Promise<Firestore> | undefined;

export function initializeFirebaseFirestore(): Promise<Firestore> {
  firestoreInitialization ??= import("firebase/firestore")
    .then(({
      getFirestore,
      initializeFirestore,
      persistentLocalCache,
      persistentMultipleTabManager,
    }) => {
      try {
        return initializeFirestore(firebaseApp, {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager(),
          }),
        });
      } catch (error) {
        const code = typeof error === "object" && error && "code" in error
          ? String(error.code)
          : "";
        if (code === "failed-precondition" || code === "already-initialized") {
          return getFirestore(firebaseApp);
        }
        throw error;
      }
    });

  return firestoreInitialization;
}

export function initializeFirebaseAnalytics(): Promise<Analytics | null> {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }

  analyticsInitialization ??= import("firebase/analytics")
    .then(async ({ getAnalytics, isSupported }) =>
      (await isSupported()) ? getAnalytics(firebaseApp) : null)
    .catch(() => null);

  return analyticsInitialization;
}
