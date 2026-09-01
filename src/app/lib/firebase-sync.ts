import { get, onValue, ref, remove, runTransaction, set } from "firebase/database";
import { onIdTokenChanged } from "firebase/auth";
import { ensureFirebaseAuthReady, firebaseAuth, firebaseDatabase } from "@/app/lib/firebase";
import { getStoreItemLabel, type MainStoreItem } from "@/app/lib/inventory-transfer";
import { mergeKitchenMenuItems, type KitchenMenuItem } from "@/app/lib/kitchen-menu";
import { getDefaultRooms, type InventoryItem } from "@/app/lib/mock-data";
import { DEFAULT_HARDWARE_SETTINGS } from "@/app/lib/hardware-settings";
import { sanitizeForStorage } from "@/app/lib/storage-sanitize";
import { sanitizeLighthouseHistory } from "@/app/lib/lighthouse-history";
import {
  chooseIncomingSyncRecord,
  getSyncRecordId,
  mergeSyncRecords,
} from "@/app/lib/sync-record-conflict";

// ── Connectivity monitoring ─────────────────────────────────────────────────
let _isConnected = false;
let _firebaseRealtimeConnected = false;
const _connectionListeners = new Set<(connected: boolean) => void>();
const _lastSyncedAt: Record<string, number> = {};
const _pendingLocalWrites: Record<string, { value: unknown; createdAt: number }> = {};
// Realtime Firebase listeners remain the primary update path. The API poll is
// only a recovery mechanism, so polling large snapshots every ten seconds was
// unnecessary and generated substantial CDN/server traffic when realtime auth
// was unavailable.
const DIRECT_FIREBASE_WRITE_TIMEOUT_MS = 15000;
// Full business snapshots must not be proxied through Vercel during normal
// operation. Opt in only for a short-lived recovery deployment if required.
const SERVER_SYNC_FALLBACK_ENABLED = process.env.NEXT_PUBLIC_ENABLE_SERVER_SYNC_FALLBACK === "true";
const SERVER_SYNC_ETAG_PREFIX = "lighthouse-server-sync-etag";
const PENDING_SYNC_MARKER_PREFIX = "lighthouse-pending-sync";
// Keep offline operational edits durable across reloads and extended outages.
// One minute was shorter than a normal connectivity interruption and allowed
// an old cloud menu to overwrite a locally saved manager price.
const PENDING_SYNC_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const HYDRATION_DEDUP_WINDOW_MS = 2000;
const _hydrationInFlight = new Map<string, Promise<void>>();
const _lastHydratedAt: Record<string, number> = {};
const _serverReadsInFlight = new Map<string, Promise<unknown | null>>();
let _pendingFlushInFlight = false;
let _pendingRetryTimer: number | null = null;

function getPendingSyncMarkerKey(key: string) {
  return `${PENDING_SYNC_MARKER_PREFIX}:${getUnifiedLocalKey(key)}`;
}

function hasPendingSyncMarker(key: string) {
  if (typeof window === "undefined") return false;
  const markerKey = getPendingSyncMarkerKey(key);
  const raw = window.localStorage.getItem(markerKey);
  if (!raw) return false;
  const markerTime = Number(raw);
  if (!Number.isFinite(markerTime) || Date.now() - markerTime > PENDING_SYNC_MAX_AGE_MS) {
    window.localStorage.removeItem(markerKey);
    return false;
  }
  return true;
}

function markPendingSync(key: string) {
  if (typeof window !== "undefined") window.localStorage.setItem(getPendingSyncMarkerKey(key), String(Date.now()));
}

function clearPendingSync(key: string) {
  if (typeof window !== "undefined") window.localStorage.removeItem(getPendingSyncMarkerKey(key));
}

function schedulePendingFirebaseFlush() {
  if (typeof window === "undefined" || _pendingRetryTimer !== null) return;
  _pendingRetryTimer = window.setTimeout(() => {
    _pendingRetryTimer = null;
    void flushPendingFirebaseWrites();
  }, 30000);
}

function getServerSyncEtagKey(key: string) {
  return `${SERVER_SYNC_ETAG_PREFIX}:${key}`;
}

function readServerSyncEtag(key: string) {
  if (typeof window === "undefined") return null;
  const etagKey = getServerSyncEtagKey(key);
  const persistentEtag = window.localStorage.getItem(etagKey);
  if (persistentEtag) return persistentEtag;

  // Preserve ETags created by the previous release, then keep them across
  // tabs and browser restarts so unchanged snapshots return an empty 304.
  const legacyEtag = window.sessionStorage.getItem(etagKey);
  if (legacyEtag) {
    window.localStorage.setItem(etagKey, legacyEtag);
  }
  return legacyEtag;
}

function writeServerSyncEtag(key: string, etag: string | null) {
  if (typeof window === "undefined") return;
  const etagKey = getServerSyncEtagKey(key);
  if (etag) {
    window.localStorage.setItem(etagKey, etag);
  } else {
    window.localStorage.removeItem(etagKey);
  }
}

function dispatchStorageUpdated(key: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("lighthouse-storage-updated", { detail: { key } }));
}

function hasRecentSyncSuccess() {
  const latestSync = Math.max(0, ...Object.values(_lastSyncedAt));
  return latestSync > 0 && Date.now() - latestSync < 120000;
}

function getEffectiveConnectionState() {
  if (!firebaseAuth.currentUser || firebaseAuth.currentUser.isAnonymous) return false;
  if (_firebaseRealtimeConnected) return true;
  if (hasRecentSyncSuccess()) return true;
  if (typeof window !== "undefined" && window.navigator.onLine && Object.keys(_lastSyncedAt).length > 0) return true;
  return false;
}

function emitConnectionState(connected: boolean) {
  _firebaseRealtimeConnected = connected;
  _isConnected = connected ? getEffectiveConnectionState() : false;
  _connectionListeners.forEach((fn) => fn(_isConnected));
  if (connected) void flushPendingFirebaseWrites();
}

function markSyncHealthy(key?: string) {
  if (key) {
    _lastSyncedAt[key] = Date.now();
  }
  _isConnected = true;
  _connectionListeners.forEach((fn) => fn(true));
}

async function fetchServerSyncedStorageValueRequest<T>(key: string): Promise<T | null> {
  const headers: Record<string, string> = {};
  const idToken = await firebaseAuth.currentUser?.getIdToken();
  if (!idToken) throw new Error("Staff cloud authentication is unavailable.");
  headers.Authorization = `Bearer ${idToken}`;
  const cachedEtag = readServerSyncEtag(key);
  if (cachedEtag) {
    headers["If-None-Match"] = cachedEtag;
  }

  const response = await withTimeout(
    fetch(`/api/storage-sync/${encodeURIComponent(key)}`, {
      method: "GET",
      headers,
      cache: "no-store",
    }),
    DIRECT_FIREBASE_WRITE_TIMEOUT_MS,
    `Server sync read timed out for ${key}`,
  );

  if (response.status === 304) {
    return readParsedLocalValue<T>(key);
  }

  if (!response.ok) {
    throw new Error(`Server sync read failed for ${key}`);
  }

  const nextEtag = response.headers.get("ETag");
  writeServerSyncEtag(key, nextEtag);

  const payload = (await response.json()) as { value?: T | null };
  return payload.value ?? null;
}

async function fetchServerSyncedStorageValue<T>(key: string): Promise<T | null> {
  const existing = _serverReadsInFlight.get(key);
  if (existing) return existing as Promise<T | null>;

  const request = fetchServerSyncedStorageValueRequest<T>(key).finally(() => {
    _serverReadsInFlight.delete(key);
  });
  _serverReadsInFlight.set(key, request);
  return request;
}

async function writeServerSyncedStorageValue<T>(key: string, value: T) {
  const idToken = await firebaseAuth.currentUser?.getIdToken();
  if (!idToken) throw new Error("Staff cloud authentication is unavailable.");
  const response = await withTimeout(
    fetch(`/api/storage-sync/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
      cache: "no-store",
    }),
    DIRECT_FIREBASE_WRITE_TIMEOUT_MS,
    `Server sync write timed out for ${key}`,
  );

  if (!response.ok) {
    throw new Error(`Server sync write failed for ${key}`);
  }

  writeServerSyncEtag(key, response.headers.get("ETag"));
}

async function removeServerSyncedStorageValue(key: string) {
  const idToken = await firebaseAuth.currentUser?.getIdToken();
  if (!idToken) throw new Error("Staff cloud authentication is unavailable.");
  const response = await withTimeout(
    fetch(`/api/storage-sync/${encodeURIComponent(key)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${idToken}` },
      cache: "no-store",
    }),
    DIRECT_FIREBASE_WRITE_TIMEOUT_MS,
    `Server sync delete timed out for ${key}`,
  );

  if (!response.ok) {
    throw new Error(`Server sync delete failed for ${key}`);
  }

  if (typeof window !== "undefined") {
    window.localStorage.removeItem(getServerSyncEtagKey(key));
    window.sessionStorage.removeItem(getServerSyncEtagKey(key));
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    void ensureFirebaseAuthReady()
      .then(() => flushPendingFirebaseWrites())
      .catch(() => emitConnectionState(false));
  });
  void ensureFirebaseAuthReady()
    .then(() => {
      onValue(ref(firebaseDatabase, ".info/connected"), (snapshot) => {
        emitConnectionState(snapshot.val() === true);
      });
    })
    .catch((error) => {
      emitConnectionState(false);
      console.error("Firebase connection monitoring failed", error);
    });
}

export function isFirebaseConnected() {
  return _isConnected;
}

export function subscribeToConnectionStatus(onChange: (connected: boolean) => void) {
  _connectionListeners.add(onChange);
  onChange(_isConnected || getEffectiveConnectionState());
  return () => {
    _connectionListeners.delete(onChange);
  };
}

const FIREBASE_STORAGE_ROOT = "lighthouse-v1";
const LIGHTHOUSE_LOCAL_STORAGE_PREFIX = "lighthouse-v1:";

function toStoragePath(key: string) {
  return `${FIREBASE_STORAGE_ROOT}/${key.replace(/[.#$[\]/]/g, "-")}`;
}

export function getUnifiedLocalKey(baseKey: string): string {
  return `${LIGHTHOUSE_LOCAL_STORAGE_PREFIX}${baseKey}`;
}

export const FIREBASE_SYNC_KEYS = [
  "lighthouse-cashier-state",
  "lighthouse-kitchen-state",
  "lighthouse-barista-state",
  "lighthouse-company-stock",
  "lighthouse-inventory-items",
  "lighthouse-main-store-items",
  "lighthouse-stock-logic",
  "lighthouse-store-movements",
  "lighthouse-store-usage",
  "lighthouse-cancelled-tickets",
  "lighthouse-barista-waste",
  "lighthouse-rooms-state",
  "lighthouse-fnb-beverage-cost",
  "lighthouse-fnb-recipe-cost",
  "lighthouse-fnb-stock-sales",
  "lighthouse-settings",
  "lighthouse-hardware-settings",
  "lighthouse-website-bookings",
  "lighthouse-website-menu-orders",
  "lighthouse-live-chat",
  "lighthouse-expenses",
  "lighthouse-laundry-records",
  "lighthouse-menu-audit-trail",
  "lighthouse-login-profiles",
  "lighthouse-staff-members",
  "lighthouse-kitchen-purchase-session",
  "lighthouse-kitchen-purchase-history",
  "lighthouse-kitchen-daily-stock-session",
  "lighthouse-kitchen-daily-stock-history",
  "lighthouse-barista-purchase-session",
  "lighthouse-barista-purchase-history",
  "lighthouse-barista-daily-stock-session",
  "lighthouse-barista-daily-stock-history",
] as const;

export const LEGACY_DEMO_KEYS = [
  "lighthouse-demo-seed-version",
  "lighthouse-cashier-transactions",
  "lighthouse-cashier-seq",
  "lighthouse-kitchen-tickets",
  "lighthouse-kitchen-seq",
  "lighthouse-kitchen-payments",
  "lighthouse-kitchen-menu",
  "lighthouse-barista-orders",
  "lighthouse-barista-seq",
  "lighthouse-barista-payments",
  "lighthouse-barista-menu",
  "lighthouse-kitchen-cancelled-tickets",
  "lighthouse-cashier-seq",
  "lighthouse-kitchen-seq",
  "lighthouse-barista-seq",
] as const;

export function migrateVerifiedLighthouseLocalData() {
  if (typeof window === "undefined") return;
  const marker = `${LIGHTHOUSE_LOCAL_STORAGE_PREFIX}verified-migration-v1`;
  if (window.localStorage.getItem(marker) === "1") return;

  const legacyCashierRaw = window.localStorage.getItem("lighthouse-cashier-state");
  if (legacyCashierRaw && !window.localStorage.getItem(getUnifiedLocalKey("lighthouse-cashier-state"))) {
    try {
      const legacyCashierState = JSON.parse(legacyCashierRaw) as unknown;
      const verifiedCashierState = sanitizeLighthouseHistory("lighthouse-cashier-state", legacyCashierState);
      const transactions = (verifiedCashierState as { transactions?: unknown[] } | null)?.transactions;
      if (Array.isArray(transactions) && transactions.length > 0) {
        window.localStorage.setItem(
          getUnifiedLocalKey("lighthouse-cashier-state"),
          JSON.stringify(verifiedCashierState),
        );
      }
    } catch {
      // Invalid legacy data is intentionally ignored.
    }
  }

  window.localStorage.setItem(marker, "1");
}

function readParsedLocalValue<T>(key: string) {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(getUnifiedLocalKey(key));
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// Physical localStorage writes and reads use one Lighthouse-specific cache namespace.
function setLocalCache(key: string, rawValue: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(getUnifiedLocalKey(key), rawValue);
}

function removeLocalCache(key: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(getUnifiedLocalKey(key));
}

function getLocalCacheRaw(key: string) {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(getUnifiedLocalKey(key));
}

function sanitizeSyncedValue<T>(key: string, value: T): T {
  const historySanitizedValue = sanitizeLighthouseHistory(key, value);
  if (
    key !== "lighthouse-kitchen-state" ||
    historySanitizedValue === null ||
    historySanitizedValue === undefined ||
    typeof historySanitizedValue !== "object"
  ) {
    return historySanitizedValue;
  }

  const snapshot = historySanitizedValue as {
    tickets?: unknown[];
    ticketSeq?: number;
    payments?: unknown[];
    menuItems?: unknown[];
  };

  return {
    tickets: Array.isArray(snapshot.tickets) ? snapshot.tickets : [],
    ticketSeq: Number.isFinite(snapshot.ticketSeq) ? Number(snapshot.ticketSeq) : 1,
    payments: Array.isArray(snapshot.payments) ? snapshot.payments : [],
    menuItems: mergeKitchenMenuItems(
      (Array.isArray(snapshot.menuItems) ? snapshot.menuItems : []) as KitchenMenuItem[],
    ),
  } as T;
}

function mirrorCanonicalStateToLegacyLocal(key: string, value: unknown) {
  if (typeof window === "undefined" || value === null || value === undefined) return;

  if (key === "lighthouse-cashier-state") {
    const snapshot = value as { transactions?: unknown[]; receiptSeq?: number };
    setLocalCache("lighthouse-cashier-transactions", JSON.stringify(Array.isArray(snapshot.transactions) ? snapshot.transactions : []));
    setLocalCache("lighthouse-cashier-seq", String(Number.isFinite(snapshot.receiptSeq) ? snapshot.receiptSeq : 1));
    localStorage.removeItem("lighthouse-demo-seed-version");
    return;
  }

  if (key === "lighthouse-kitchen-state") {
    const snapshot = sanitizeSyncedValue(key, value) as { tickets?: unknown[]; ticketSeq?: number; payments?: unknown[]; menuItems?: unknown[] };
    setLocalCache("lighthouse-kitchen-tickets", JSON.stringify(Array.isArray(snapshot.tickets) ? snapshot.tickets : []));
    setLocalCache("lighthouse-kitchen-seq", String(Number.isFinite(snapshot.ticketSeq) ? snapshot.ticketSeq : 1));
    setLocalCache(
      "lighthouse-kitchen-payments",
      JSON.stringify(Array.isArray(snapshot.payments) ? snapshot.payments : []),
    );
    setLocalCache("lighthouse-kitchen-menu", JSON.stringify(Array.isArray(snapshot.menuItems) ? snapshot.menuItems : []));
    localStorage.removeItem("lighthouse-demo-seed-version");
    return;
  }

  if (key === "lighthouse-barista-state") {
    const snapshot = value as { tickets?: unknown[]; ticketSeq?: number; payments?: unknown[]; menuItems?: unknown[] };
    setLocalCache("lighthouse-barista-orders", JSON.stringify(Array.isArray(snapshot.tickets) ? snapshot.tickets : []));
    setLocalCache("lighthouse-barista-seq", String(Number.isFinite(snapshot.ticketSeq) ? snapshot.ticketSeq : 1));
    setLocalCache("lighthouse-barista-payments", JSON.stringify(Array.isArray(snapshot.payments) ? snapshot.payments : []));
    setLocalCache("lighthouse-barista-menu", JSON.stringify(Array.isArray(snapshot.menuItems) ? snapshot.menuItems : []));
    localStorage.removeItem("lighthouse-demo-seed-version");
  }
}

function buildInventoryItemsFromStoreItems(storeItems: MainStoreItem[]) {
  const normalizedItems = new Map<string, InventoryItem>();

  for (const item of storeItems) {
    const category = item.lane === "barista" ? "Bar" : "Kitchen";
    const name = getStoreItemLabel(item);
    const subCategory = item.subCategory || "";
    const mapKey = `${category}:${subCategory.toLowerCase()}:${name.toLowerCase()}:${item.unit.toLowerCase()}`;
    const existing = normalizedItems.get(mapKey);

    if (existing) {
      existing.stock += item.stock;
      existing.minStock = Math.max(existing.minStock, item.minStock);
      if ((!existing.price || existing.price <= 0) && typeof item.buyingPrice === "number" && item.buyingPrice > 0) {
        existing.price = typeof item.sellingPrice === "number" && item.sellingPrice > 0
          ? item.sellingPrice
          : item.buyingPrice;
      }
      if ((!existing.sellingPrice || existing.sellingPrice <= 0) && typeof item.sellingPrice === "number" && item.sellingPrice > 0) {
        existing.sellingPrice = item.sellingPrice;
      }
      continue;
    }

    normalizedItems.set(mapKey, {
      id: `inv-${item.id}`,
      barcode: "", // Default to empty if not in store item
      name,
      category,
      subCategory,
      size: item.size || "",
      stock: item.stock,
      totSold: 0,
      buyingPrice: typeof item.buyingPrice === "number" ? item.buyingPrice : 0,
      sellingPrice: typeof item.sellingPrice === "number" ? item.sellingPrice : 0,
      status: "ACTIVE" as const,
      minStock: item.minStock,
      unit: item.unit,
      price:
        typeof item.sellingPrice === "number" && item.sellingPrice > 0
          ? item.sellingPrice
          : typeof item.buyingPrice === "number"
            ? item.buyingPrice
            : 0,
    });
  }

  return Array.from(normalizedItems.values());
}

function getSnapshotScore(key: string, value: unknown): number {
  if (value === null || value === undefined) return 0;

  if (key === "lighthouse-cashier-state") {
    const snapshot = value as { transactions?: unknown[]; receiptSeq?: number };
    return (Array.isArray(snapshot.transactions) ? snapshot.transactions.length * 1000 : 0) + (Number.isFinite(snapshot.receiptSeq) ? 1 : 0);
  }

  if (key === "lighthouse-kitchen-state" || key === "lighthouse-barista-state") {
    const snapshot = value as { tickets?: unknown[]; payments?: unknown[]; menuItems?: unknown[]; ticketSeq?: number };
    return (
      (Array.isArray(snapshot.menuItems) ? snapshot.menuItems.length * 1000 : 0) +
      (Array.isArray(snapshot.tickets) ? snapshot.tickets.length * 100 : 0) +
      (Array.isArray(snapshot.payments) ? snapshot.payments.length * 100 : 0) +
      (Number.isFinite(snapshot.ticketSeq) ? 1 : 0)
    );
  }

  if (Array.isArray(value)) {
    return value.length;
  }

  if (typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length;
  }

  return 1;
}

function hasUsableSyncedValue(key: string, value: unknown) {
  if (value === null || value === undefined) return false;

  if (key === "lighthouse-cashier-state") {
    const snapshot = value as { transactions?: unknown[]; receiptSeq?: number };
    return Array.isArray(snapshot.transactions) && snapshot.transactions.length > 0;
  }

  if (key === "lighthouse-rooms-state") {
    // A complete room snapshot must contain every configured Lighthouse room.
    return Array.isArray(value) && value.length >= getDefaultRooms().length;
  }

  if (key === "lighthouse-kitchen-state" || key === "lighthouse-barista-state") {
    const snapshot = value as { tickets?: unknown[]; payments?: unknown[]; menuItems?: unknown[]; ticketSeq?: number };
    return (
      (Array.isArray(snapshot.tickets) && snapshot.tickets.length > 0) ||
      (Array.isArray(snapshot.payments) && snapshot.payments.length > 0) ||
      (Array.isArray(snapshot.menuItems) && snapshot.menuItems.length > 0) ||
      Number.isFinite(snapshot.ticketSeq)
    );
  }

  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

function areSnapshotsEqual(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function shouldIgnoreRemoteValue(key: string, remoteValue: unknown) {
  const pending = _pendingLocalWrites[key];
  if (!pending) {
    if (typeof window !== "undefined" && !hasPendingSyncMarker(key)) {
      clearPendingSync(key);
    }
    return false;
  }

  if (areSnapshotsEqual(remoteValue, pending.value)) {
    delete _pendingLocalWrites[key];
    clearPendingSync(key);
    return false;
  }

  const localValue = sanitizeForStorage(sanitizeSyncedValue(key, readParsedLocalValue(key)));
  return areSnapshotsEqual(localValue, pending.value);
}

function mergeCashierStateForSync(localValue: unknown, remoteValue: unknown) {
  const localSnapshot = localValue as { transactions?: unknown[]; receiptSeq?: number };
  const remoteSnapshot = remoteValue as { transactions?: unknown[]; receiptSeq?: number };

  if (!Array.isArray(localSnapshot?.transactions) || !Array.isArray(remoteSnapshot?.transactions)) {
    return localValue;
  }

  const localTransactions = localSnapshot.transactions;
  const remoteTransactions = remoteSnapshot.transactions;

  const mergedById = new Map<string, unknown>();

  for (const transaction of remoteTransactions) {
    const id = getSyncRecordId(transaction);
    if (id) {
      const existingRecord = mergedById.get(id);
      mergedById.set(id, existingRecord ? chooseIncomingSyncRecord(existingRecord, transaction) : transaction);
    }
  }

  for (const transaction of localTransactions) {
    const id = getSyncRecordId(transaction);
    if (id) {
      const existingRecord = mergedById.get(id);
      mergedById.set(id, existingRecord ? chooseIncomingSyncRecord(existingRecord, transaction) : transaction);
    }
  }

  const mergedTransactions = Array.from(mergedById.values()).sort((a, b) => {
    const left = typeof a === "object" && a !== null ? Number((a as { createdAt?: unknown }).createdAt) : 0;
    const right = typeof b === "object" && b !== null ? Number((b as { createdAt?: unknown }).createdAt) : 0;
    return (Number.isFinite(right) ? right : 0) - (Number.isFinite(left) ? left : 0);
  });

  if (areSnapshotsEqual(mergedTransactions, localTransactions)) {
    return localValue;
  }

  return {
    ...localSnapshot,
    transactions: mergedTransactions,
    receiptSeq: Math.max(
      Number.isFinite(localSnapshot.receiptSeq) ? Number(localSnapshot.receiptSeq) : 0,
      Number.isFinite(remoteSnapshot.receiptSeq) ? Number(remoteSnapshot.receiptSeq) : 0,
    ),
  };
}

function mergeRecordsById(localRecords: unknown[], remoteRecords: unknown[]) {
  // The local save is incoming authority. Revisions still protect a newer
  // remote record from a stale browser write.
  return mergeSyncRecords(remoteRecords, localRecords);
}

function mergeRecordsByIdWithRemoteWins(localRecords: unknown[], remoteRecords: unknown[]) {
  return mergeSyncRecords(localRecords, remoteRecords);
}

function mergeArrayRecordsForSync(localValue: unknown, remoteValue: unknown) {
  if (!Array.isArray(localValue) || !Array.isArray(remoteValue)) return localValue;
  return mergeRecordsById(localValue, remoteValue);
}

function mergePosStateForSync(localValue: unknown, remoteValue: unknown) {
  const localSnapshot = localValue as { tickets?: unknown[]; ticketSeq?: number; payments?: unknown[]; menuItems?: unknown[] };
  const remoteSnapshot = remoteValue as { tickets?: unknown[]; ticketSeq?: number; payments?: unknown[]; menuItems?: unknown[] };

  if (!localSnapshot || typeof localSnapshot !== "object" || !remoteSnapshot || typeof remoteSnapshot !== "object") {
    return localValue;
  }

  const localTickets = Array.isArray(localSnapshot.tickets) ? localSnapshot.tickets : [];
  const remoteTickets = Array.isArray(remoteSnapshot.tickets) ? remoteSnapshot.tickets : [];
  const localPayments = Array.isArray(localSnapshot.payments) ? localSnapshot.payments : [];
  const remotePayments = Array.isArray(remoteSnapshot.payments) ? remoteSnapshot.payments : [];
  const localMenuItems = Array.isArray(localSnapshot.menuItems) ? localSnapshot.menuItems : [];
  const remoteMenuItems = Array.isArray(remoteSnapshot.menuItems) ? remoteSnapshot.menuItems : [];

  return {
    ...localSnapshot,
    tickets: mergeRecordsById(localTickets, remoteTickets),
    payments: mergeRecordsById(localPayments, remotePayments),
    menuItems: mergeRecordsById(localMenuItems, remoteMenuItems),
    ticketSeq: Math.max(
      Number.isFinite(localSnapshot.ticketSeq) ? Number(localSnapshot.ticketSeq) : 0,
      Number.isFinite(remoteSnapshot.ticketSeq) ? Number(remoteSnapshot.ticketSeq) : 0,
    ),
  };
}

function mergeCashierStateForRemoteApply(localValue: unknown, remoteValue: unknown) {
  const localSnapshot = localValue as { transactions?: unknown[]; receiptSeq?: number };
  const remoteSnapshot = remoteValue as { transactions?: unknown[]; receiptSeq?: number };

  if (!Array.isArray(localSnapshot?.transactions) || !Array.isArray(remoteSnapshot?.transactions)) {
    return remoteValue;
  }

  return {
    ...localSnapshot,
    ...remoteSnapshot,
    transactions: mergeRecordsByIdWithRemoteWins(localSnapshot.transactions, remoteSnapshot.transactions),
    receiptSeq: Math.max(
      Number.isFinite(localSnapshot.receiptSeq) ? Number(localSnapshot.receiptSeq) : 0,
      Number.isFinite(remoteSnapshot.receiptSeq) ? Number(remoteSnapshot.receiptSeq) : 0,
    ),
  };
}

function mergePosStateForRemoteApply(localValue: unknown, remoteValue: unknown) {
  const localSnapshot = localValue as { tickets?: unknown[]; ticketSeq?: number; payments?: unknown[]; menuItems?: unknown[] };
  const remoteSnapshot = remoteValue as { tickets?: unknown[]; ticketSeq?: number; payments?: unknown[]; menuItems?: unknown[] };

  if (!localSnapshot || typeof localSnapshot !== "object" || !remoteSnapshot || typeof remoteSnapshot !== "object") {
    return remoteValue;
  }

  const localTickets = Array.isArray(localSnapshot.tickets) ? localSnapshot.tickets : [];
  const remoteTickets = Array.isArray(remoteSnapshot.tickets) ? remoteSnapshot.tickets : [];
  const localPayments = Array.isArray(localSnapshot.payments) ? localSnapshot.payments : [];
  const remotePayments = Array.isArray(remoteSnapshot.payments) ? remoteSnapshot.payments : [];
  const localMenuItems = Array.isArray(localSnapshot.menuItems) ? localSnapshot.menuItems : [];
  const remoteMenuItems = Array.isArray(remoteSnapshot.menuItems) ? remoteSnapshot.menuItems : [];

  return {
    ...localSnapshot,
    ...remoteSnapshot,
    tickets: mergeRecordsByIdWithRemoteWins(localTickets, remoteTickets),
    payments: mergeRecordsByIdWithRemoteWins(localPayments, remotePayments),
    menuItems: mergeRecordsByIdWithRemoteWins(localMenuItems, remoteMenuItems),
    ticketSeq: Math.max(
      Number.isFinite(localSnapshot.ticketSeq) ? Number(localSnapshot.ticketSeq) : 0,
      Number.isFinite(remoteSnapshot.ticketSeq) ? Number(remoteSnapshot.ticketSeq) : 0,
    ),
  };
}

function mergeRemoteValueWithLocalOnlyRecords(key: string, localValue: unknown, remoteValue: unknown) {
  if (key === "lighthouse-cashier-state") {
    return mergeCashierStateForRemoteApply(localValue, remoteValue);
  }

  if (key === "lighthouse-kitchen-state" || key === "lighthouse-barista-state") {
    return mergePosStateForRemoteApply(localValue, remoteValue);
  }

  if (Array.isArray(localValue) && Array.isArray(remoteValue)) {
    return mergeRecordsByIdWithRemoteWins(localValue, remoteValue);
  }

  return remoteValue;
}

function protectSyncedValueBeforeWrite(key: string, localValue: unknown, remoteValue: unknown) {
  if (key === "lighthouse-cashier-state") {
    return mergeCashierStateForSync(localValue, remoteValue);
  }

  if (key === "lighthouse-kitchen-state" || key === "lighthouse-barista-state") {
    return mergePosStateForSync(localValue, remoteValue);
  }

  if (
    key === "lighthouse-website-bookings" ||
    key === "lighthouse-company-stock" ||
    key === "lighthouse-live-chat" ||
    key === "lighthouse-expenses" ||
    key === "lighthouse-laundry-records" ||
    key === "lighthouse-cancelled-tickets" ||
    key === "lighthouse-menu-audit-trail" ||
    key === "lighthouse-store-movements" ||
    key === "lighthouse-store-usage" ||
    key === "lighthouse-kitchen-purchase-history" ||
    key === "lighthouse-kitchen-daily-stock-history" ||
    key === "lighthouse-barista-purchase-history" ||
    key === "lighthouse-barista-daily-stock-history"
  ) {
    return mergeArrayRecordsForSync(localValue, remoteValue);
  }

  return localValue;
}

async function reconcileStorageValueInFirebase(key: string, preferredValue: unknown) {
  const transaction = await runTransaction(ref(firebaseDatabase, toStoragePath(key)), (currentValue) =>
    sanitizeForStorage(sanitizeSyncedValue(key, protectSyncedValueBeforeWrite(key, preferredValue, currentValue))),
  );
  return sanitizeForStorage(sanitizeSyncedValue(key, transaction.snapshot.val()));
}

function getCanonicalDefaultValue(key: string) {
  switch (key) {
    case "lighthouse-cashier-state":
      return { transactions: [], receiptSeq: 1 };
    case "lighthouse-kitchen-state":
      return { tickets: [], ticketSeq: 1, payments: [], menuItems: [] };
    case "lighthouse-barista-state":
      return { tickets: [], ticketSeq: 1, payments: [], menuItems: [] };
    case "lighthouse-company-stock":
    case "lighthouse-inventory-items":
    case "lighthouse-main-store-items":
    case "lighthouse-stock-logic":
    case "lighthouse-store-movements":
    case "lighthouse-store-usage":
    case "lighthouse-cancelled-tickets":
    case "lighthouse-fnb-beverage-cost":
    case "lighthouse-fnb-recipe-cost":
    case "lighthouse-fnb-stock-sales":
    case "lighthouse-website-bookings":
    case "lighthouse-live-chat":
    case "lighthouse-expenses":
    case "lighthouse-laundry-records":
    case "lighthouse-menu-audit-trail":
    case "lighthouse-staff-members":
    case "lighthouse-kitchen-purchase-history":
    case "lighthouse-kitchen-daily-stock-history":
    case "lighthouse-barista-purchase-history":
    case "lighthouse-barista-daily-stock-history":
      return [];
    case "lighthouse-kitchen-purchase-session":
    case "lighthouse-kitchen-daily-stock-session":
    case "lighthouse-barista-purchase-session":
    case "lighthouse-barista-daily-stock-session":
      return null;
    case "lighthouse-rooms-state":
      return getDefaultRooms();
    case "lighthouse-settings":
      return {
        fullName: "",
        email: "",
        department: "Lodge Operations",
        notificationsRealtime: true,
        notificationsEmailDigest: true,
        analyticsAdvanced: false,
        requirePinForCheckout: true,
        autoLockMinutes: 15,
        currency: "TSh",
        timezone: "Africa/Dar_es_Salaam",
      };
    case "lighthouse-hardware-settings":
      return DEFAULT_HARDWARE_SETTINGS;
    case "lighthouse-login-profiles":
      return {};
    default:
      return null;
  }
}

function getLocalFallbackForSync(key: string) {
  if (typeof window === "undefined") return null;

  const directValue = readParsedLocalValue(key);
  if (directValue !== null) {
    return directValue;
  }

  if (key === "lighthouse-cashier-state") {
    const transactions = readParsedLocalValue<unknown[]>("lighthouse-cashier-transactions") ?? [];
    const receiptSeq = Number(getLocalCacheRaw("lighthouse-cashier-seq"));
    if (transactions.length === 0 && !Number.isFinite(receiptSeq)) return null;
    return {
      transactions,
      receiptSeq: Number.isFinite(receiptSeq) && receiptSeq > 0 ? receiptSeq : 1,
    };
  }

  if (key === "lighthouse-kitchen-state") {
    const tickets = readParsedLocalValue<unknown[]>("lighthouse-kitchen-tickets") ?? [];
    const payments = readParsedLocalValue<unknown[]>("lighthouse-kitchen-payments") ?? [];
    const menuItems = mergeKitchenMenuItems(
      ((readParsedLocalValue<unknown[]>("lighthouse-kitchen-menu") ?? []) as KitchenMenuItem[]),
    );
    const ticketSeq = Number(getLocalCacheRaw("lighthouse-kitchen-seq"));
    if (tickets.length === 0 && payments.length === 0 && menuItems.length === 0 && !Number.isFinite(ticketSeq)) {
      return null;
    }
    return {
      tickets,
      ticketSeq: Number.isFinite(ticketSeq) && ticketSeq > 0 ? ticketSeq : 1,
      payments,
      menuItems,
    };
  }

  if (key === "lighthouse-barista-state") {
    const tickets = readParsedLocalValue<unknown[]>("lighthouse-barista-orders") ?? [];
    const payments = readParsedLocalValue<unknown[]>("lighthouse-barista-payments") ?? [];
    const menuItems = readParsedLocalValue<unknown[]>("lighthouse-barista-menu") ?? [];
    const ticketSeq = Number(getLocalCacheRaw("lighthouse-barista-seq"));
    if (tickets.length === 0 && payments.length === 0 && menuItems.length === 0 && !Number.isFinite(ticketSeq)) {
      return null;
    }
    return {
      tickets,
      ticketSeq: Number.isFinite(ticketSeq) && ticketSeq > 0 ? ticketSeq : 1,
      payments,
      menuItems,
    };
  }

  if (key === "lighthouse-inventory-items") {
    const storeItems = readParsedLocalValue<MainStoreItem[]>("lighthouse-main-store-items") ?? [];
    if (storeItems.length === 0) return null;
    return buildInventoryItemsFromStoreItems(storeItems);
  }

  return null;
}

function getLocalSyncedValue(key: string) {
  if (typeof window === "undefined") return null;
  return sanitizeForStorage(sanitizeSyncedValue(key, getLocalFallbackForSync(key) ?? readParsedLocalValue(key) ?? null));
}

function getLocalCashierTransactionsForRooms() {
  const canonical = readParsedLocalValue<{ transactions?: unknown[] }>("lighthouse-cashier-state");
  if (Array.isArray(canonical?.transactions)) return canonical.transactions;
  return readParsedLocalValue<unknown[]>("lighthouse-cashier-transactions") ?? [];
}

function getActiveLocalBookedRoomNumbers() {
  return new Set(
    getLocalCashierTransactionsForRooms()
      .filter((booking) => {
        if (typeof booking !== "object" || booking === null) return false;
        const roomNumber = (booking as { roomNumber?: unknown }).roomNumber;
        const status = (booking as { status?: unknown }).status;
        return typeof roomNumber === "string" && roomNumber.trim().length > 0 && status !== "checked-out";
      })
      .map((booking) => (booking as { roomNumber: string }).roomNumber),
  );
}

function applyLocalBookingOccupancy(key: string, value: unknown) {
  if (key !== "lighthouse-rooms-state" || !Array.isArray(value)) return value;

  const occupiedRooms = getActiveLocalBookedRoomNumbers();
  if (occupiedRooms.size === 0) return value;

  return value.map((room) => {
    if (typeof room !== "object" || room === null) return room;
    const roomNumber = (room as { number?: unknown }).number;
    if (typeof roomNumber !== "string" || !occupiedRooms.has(roomNumber)) return room;
    return (room as { status?: unknown }).status === "occupied" ? room : { ...room, status: "occupied" };
  });
}

function mergeRemoteValueForLocalApply(key: string, remoteValue: unknown) {
  const localValue = getLocalSyncedValue(key);
  if (!hasUsableSyncedValue(key, localValue)) return applyLocalBookingOccupancy(key, remoteValue);
  if (!hasUsableSyncedValue(key, remoteValue)) return applyLocalBookingOccupancy(key, localValue);
  // A durable pending marker means this browser has a local change that has not
  // yet been acknowledged. Otherwise Firebase is canonical. Always unioning a
  // browser's cache with Firebase made removed POS records reappear forever and
  // then spread those stale records to every other browser.
  if (!hasPendingSyncMarker(key)) return applyLocalBookingOccupancy(key, remoteValue);
  return applyLocalBookingOccupancy(key, mergeRemoteValueWithLocalOnlyRecords(key, localValue, remoteValue));
}

function readSnapshotValue<T>(key: string, rawValue: T | null, onChange: (value: T | null) => void) {
  if (typeof window === "undefined") return;
  if (rawValue === null) {
    removeLocalCache(key);
    dispatchStorageUpdated(key);
    onChange(null);
    return;
  }

  setLocalCache(key, JSON.stringify(rawValue));
  dispatchStorageUpdated(key);
  onChange(rawValue);
}

export async function syncStorageValueToFirebase<T>(key: string, value: T) {
  if (typeof window === "undefined") return false;
  const sanitizedValue: unknown = sanitizeForStorage(sanitizeSyncedValue(key, value));
  const pendingWrite = { value: sanitizedValue, createdAt: Date.now() };
  _pendingLocalWrites[key] = pendingWrite;
  markPendingSync(key);

  // Write straight to Firebase during normal operation. Routing every growing
  // POS snapshot through a Vercel Function made each save count as incoming
  // Fast Origin Transfer. The transaction preserves concurrent records and
  // the timeout keeps the API available as a reliable fallback.
  try {
    await withTimeout(
      ensureFirebaseAuthReady(),
      DIRECT_FIREBASE_WRITE_TIMEOUT_MS,
      `Firebase authentication timed out for ${key}`,
    );
    const transaction = await withTimeout(
      runTransaction(ref(firebaseDatabase, toStoragePath(key)), (remoteValue) =>
        sanitizeForStorage(sanitizeSyncedValue(key, protectSyncedValueBeforeWrite(key, sanitizedValue, remoteValue))),
      ),
      DIRECT_FIREBASE_WRITE_TIMEOUT_MS,
      `Firebase transaction timed out for ${key}`,
    );
    const committedValue = sanitizeForStorage(sanitizeSyncedValue(key, transaction.snapshot.val()));
    // A second save for the same key may have started while this transaction
    // was in flight. Never let the older completion replace that newer local
    // snapshot or clear its retry marker.
    if (_pendingLocalWrites[key] === pendingWrite) {
      setLocalCache(key, JSON.stringify(committedValue));
      delete _pendingLocalWrites[key];
      clearPendingSync(key);
      dispatchStorageUpdated(key);
    }
    markSyncHealthy(key);
    return true;
  } catch (firebaseError) {
    console.error(`Firebase direct sync failed for ${key}`, firebaseError);
  }

  if (!SERVER_SYNC_FALLBACK_ENABLED) {
    emitConnectionState(false);
    schedulePendingFirebaseFlush();
    return false;
  }

  try {
    await writeServerSyncedStorageValue(key, sanitizedValue);
    if (_pendingLocalWrites[key] === pendingWrite) {
      setLocalCache(key, JSON.stringify(sanitizedValue));
      delete _pendingLocalWrites[key];
      clearPendingSync(key);
      dispatchStorageUpdated(key);
    }
    markSyncHealthy(key);
    return true;
  } catch (serverError) {
    emitConnectionState(false);
    console.error(`Server sync fallback failed for ${key}`, serverError);
    return false;
  }
}

async function flushPendingFirebaseWrites() {
  if (_pendingFlushInFlight || typeof window === "undefined" || !window.navigator.onLine) return;
  const pendingKeys = Object.keys(_pendingLocalWrites);
  if (pendingKeys.length === 0) return;

  _pendingFlushInFlight = true;
  try {
    for (const key of pendingKeys) {
      const latest = _pendingLocalWrites[key];
      if (!latest) continue;
      await syncStorageValueToFirebase(key, latest.value);
    }
  } finally {
    _pendingFlushInFlight = false;
  }
}

async function hydrateStorageKeyFromFirebaseInternal(key: string) {
  if (typeof window === "undefined") return;

  const applyHydratedValue = (value: unknown) => {
    const sanitizedValue = sanitizeForStorage(sanitizeSyncedValue(key, value));
    if (sanitizedValue === null || sanitizedValue === undefined) return null;
    setLocalCache(key, JSON.stringify(sanitizedValue));
    mirrorCanonicalStateToLegacyLocal(key, sanitizedValue);
    dispatchStorageUpdated(key);
    return sanitizedValue;
  };

  try {
    await withTimeout(
      ensureFirebaseAuthReady(),
      DIRECT_FIREBASE_WRITE_TIMEOUT_MS,
      `Firebase authentication timed out while hydrating ${key}`,
    );
    const snapshot = await withTimeout(
      get(ref(firebaseDatabase, toStoragePath(key))),
      DIRECT_FIREBASE_WRITE_TIMEOUT_MS,
      `Firebase read timed out while hydrating ${key}`,
    );
    const remoteValue = snapshot.exists() ? sanitizeForStorage(sanitizeSyncedValue(key, snapshot.val())) : null;
    const localValue = getLocalSyncedValue(key);

    const canonicalValue = sanitizeForStorage(getCanonicalDefaultValue(key));
    if (remoteValue === null && localValue === null && canonicalValue === null) return;

    const remoteScore = hasUsableSyncedValue(key, remoteValue) ? getSnapshotScore(key, remoteValue) : 0;
    const localScore = getSnapshotScore(key, localValue);
    const canonicalScore = getSnapshotScore(key, canonicalValue);

    let preferredValue: unknown = canonicalValue;
    if (hasPendingSyncMarker(key) && localValue !== null) {
      preferredValue = protectSyncedValueBeforeWrite(key, localValue, remoteValue);
    } else if (remoteScore > 0) {
      preferredValue = mergeRemoteValueForLocalApply(key, remoteValue);
    } else if (localScore >= remoteScore && localScore >= canonicalScore) {
      preferredValue = localValue;
    }

    if (preferredValue === null) return;

    const sanitizedPreferredValue = applyHydratedValue(preferredValue);
    if (sanitizedPreferredValue === null) return;

    if (!areSnapshotsEqual(remoteValue, sanitizedPreferredValue)) {
      const committedValue = await withTimeout(
        reconcileStorageValueInFirebase(key, sanitizedPreferredValue),
        DIRECT_FIREBASE_WRITE_TIMEOUT_MS,
        `Firebase reconciliation timed out while hydrating ${key}`,
      );
      applyHydratedValue(committedValue);
    }

    clearPendingSync(key);
    delete _pendingLocalWrites[key];
    markSyncHealthy(key);
  } catch (error) {
    console.error(`Firebase direct hydrate failed for ${key}`, error);
    if (!SERVER_SYNC_FALLBACK_ENABLED) {
      emitConnectionState(false);
      return;
    }
    try {
      const serverValue = sanitizeForStorage(sanitizeSyncedValue(key, await fetchServerSyncedStorageValue(key)));
      if (hasUsableSyncedValue(key, serverValue)) {
        const mergedServerValue = sanitizeForStorage(sanitizeSyncedValue(key, mergeRemoteValueForLocalApply(key, serverValue)));
        const sanitizedServerValue = applyHydratedValue(mergedServerValue);
        if (sanitizedServerValue !== null && !areSnapshotsEqual(serverValue, sanitizedServerValue)) {
          await writeServerSyncedStorageValue(key, sanitizedServerValue).catch(() => undefined);
        }
      }
      markSyncHealthy(key);
    } catch (serverError) {
      emitConnectionState(false);
      console.error(`Server hydrate fallback failed for ${key}`, serverError);
    }
  }
}

export function hydrateStorageKeyFromFirebase(key: string, force = false): Promise<void> {
  const existing = _hydrationInFlight.get(key);
  if (existing) return existing;
  if (!force && (_lastHydratedAt[key] ?? 0) > Date.now() - HYDRATION_DEDUP_WINDOW_MS) {
    return Promise.resolve();
  }

  const hydration = hydrateStorageKeyFromFirebaseInternal(key).finally(() => {
    _hydrationInFlight.delete(key);
    _lastHydratedAt[key] = Date.now();
  });
  _hydrationInFlight.set(key, hydration);
  return hydration;
}

export async function hydrateDefaultAppStateFromFirebase() {
  await Promise.all(FIREBASE_SYNC_KEYS.map((key) => hydrateStorageKeyFromFirebase(key)));
}

export function subscribeToSyncedStorageKey<T>(key: string, onChange: (value: T | null) => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const emitLocalValue = () => {
    const raw = getLocalCacheRaw(key);
    if (!raw) {
      onChange(null);
      return;
    }

    try {
      onChange(JSON.parse(raw) as T);
    } catch {
      onChange(null);
    }
  };

  const handleCustomEvent = (event: Event) => {
    const detail = (event as CustomEvent<{ key?: string }>).detail;
    if (detail?.key === key) emitLocalValue();
  };

  const handleStorageEvent = (event: StorageEvent) => {
    if (event.key === key || event.key === getUnifiedLocalKey(key)) emitLocalValue();
  };

  window.addEventListener("lighthouse-storage-updated", handleCustomEvent as EventListener);
  window.addEventListener("storage", handleStorageEvent);

  let firebaseUnsubscribe: () => void = () => {};
  let firebaseAuthUnsubscribe: () => void = () => {};
  let attachedFirebaseUid: string | null = null;
  let isDisposed = false;
  let pollTimer: number | null = null;
  let pendingReconcileTimer: number | null = null;
  let firebaseRetryTimer: number | null = null;
  let firebaseRetryDelayMs = 5000;
  let retryFirebaseSubscription: () => void = () => undefined;

  const reconcileDurablePendingWrite = () => {
    if (isDisposed || !window.navigator.onLine || !hasPendingSyncMarker(key) || _pendingLocalWrites[key]) return;
    void hydrateStorageKeyFromFirebase(key, true);
  };

  const stopFallbackPolling = () => {
    if (pollTimer !== null) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  };

  const pollServerSnapshot = async () => {
    if (document.visibilityState !== "visible" || !window.navigator.onLine) return;
    try {
      const remoteValue = sanitizeForStorage(sanitizeSyncedValue(key, await fetchServerSyncedStorageValue<T>(key)));
      if (remoteValue === null) return;
      if (shouldIgnoreRemoteValue(key, remoteValue)) return;
      const nextValue = sanitizeForStorage(sanitizeSyncedValue(key, mergeRemoteValueForLocalApply(key, remoteValue)));
      const currentValue = sanitizeForStorage(readParsedLocalValue<T>(key));
      if (!areSnapshotsEqual(currentValue, nextValue)) {
        setLocalCache(key, JSON.stringify(nextValue));
        mirrorCanonicalStateToLegacyLocal(key, nextValue);
        dispatchStorageUpdated(key);
        onChange(nextValue as T);
      }
      if (!areSnapshotsEqual(remoteValue, nextValue)) {
        await writeServerSyncedStorageValue(key, nextValue).catch(() => undefined);
      }
      markSyncHealthy(key);
    } catch {
      // Keep the fallback poll alive; the next successful request or Firebase reconnect will recover state.
    }
  };

  const ensureFallbackPolling = () => {
    if (!SERVER_SYNC_FALLBACK_ENABLED || pollTimer !== null || isDisposed) return;
    void pollServerSnapshot();
    pollTimer = window.setInterval(() => {
      void pollServerSnapshot();
    }, 120000);
  };

  const resumeFallbackPolling = () => {
    if (document.visibilityState === "visible" && window.navigator.onLine) {
      retryFirebaseSubscription();
      reconcileDurablePendingWrite();
      // Mobile browsers can suspend the realtime socket in the background.
      // Force one canonical read on resume so Payments never keeps an older
      // snapshot until another database event happens to arrive.
      void hydrateStorageKeyFromFirebase(key, true);
      void pollServerSnapshot();
    }
  };

  window.addEventListener("online", resumeFallbackPolling);
  document.addEventListener("visibilitychange", resumeFallbackPolling);

  // Every subscriber must reconcile durable offline writes. Previously only a
  // few pages explicitly hydrated, so a marker left by a failed write could
  // cause this realtime listener to ignore cloud changes indefinitely.
  if (hasPendingSyncMarker(key) && !_pendingLocalWrites[key]) {
    reconcileDurablePendingWrite();
    // A browser reload loses the in-memory retry queue, but the complete local
    // POS snapshot and durable marker remain. Keep retrying until Firebase
    // acknowledges that snapshot instead of abandoning it after one transient
    // authentication or network failure.
    pendingReconcileTimer = window.setInterval(reconcileDurablePendingWrite, 30000);
  }

  const attachFirebaseSubscription = () => {
    const currentUid = firebaseAuth.currentUser?.uid ?? null;
    if (isDisposed || !currentUid || attachedFirebaseUid === currentUid) return;

    firebaseUnsubscribe();
    attachedFirebaseUid = currentUid;
    firebaseUnsubscribe = onValue(
        ref(firebaseDatabase, toStoragePath(key)),
        (snapshot) => {
          firebaseRetryDelayMs = 5000;
          if (firebaseRetryTimer !== null) {
            window.clearTimeout(firebaseRetryTimer);
            firebaseRetryTimer = null;
          }
          if (!snapshot.exists()) {
            const fallbackValue = sanitizeForStorage((getLocalFallbackForSync(key) ?? getCanonicalDefaultValue(key)) as T | null);
            if (fallbackValue !== null) {
              setLocalCache(key, JSON.stringify(fallbackValue));
              mirrorCanonicalStateToLegacyLocal(key, fallbackValue);
              void reconcileStorageValueInFirebase(key, fallbackValue).catch(() => undefined);
              dispatchStorageUpdated(key);
              onChange(fallbackValue);
              markSyncHealthy(key);
              stopFallbackPolling();
              return;
            }
            readSnapshotValue<T>(key, null, onChange);
            return;
          }
          const nextValue = sanitizeForStorage(sanitizeSyncedValue(key, snapshot.val() as T));
          if (shouldIgnoreRemoteValue(key, nextValue)) {
            return;
          }
          const mergedValue = sanitizeForStorage(sanitizeSyncedValue(key, mergeRemoteValueForLocalApply(key, nextValue)));
          mirrorCanonicalStateToLegacyLocal(key, mergedValue);
          readSnapshotValue<T>(key, mergedValue as T, onChange);
          if (!areSnapshotsEqual(nextValue, mergedValue)) {
            void reconcileStorageValueInFirebase(key, mergedValue).catch(() => undefined);
          }
          markSyncHealthy(key);
          stopFallbackPolling();
        },
        (error) => {
          emitConnectionState(false);
          console.error(`Firebase subscription failed for ${key}`, error);
          // Firebase cancels a realtime listener after permission/token errors.
          // Clear the attachment guard and retry so a refreshed token or a
          // recovered connection can restore live menu updates for this UID.
          firebaseUnsubscribe = () => {};
          attachedFirebaseUid = null;
          ensureFallbackPolling();
          if (!isDisposed && firebaseRetryTimer === null) {
            const retryDelay = firebaseRetryDelayMs;
            firebaseRetryDelayMs = Math.min(firebaseRetryDelayMs * 2, 120000);
            firebaseRetryTimer = window.setTimeout(() => {
              firebaseRetryTimer = null;
              attachFirebaseSubscription();
            }, retryDelay);
          }
        },
      );
  };
  retryFirebaseSubscription = attachFirebaseSubscription;

  // Child pages can mount before the dashboard finishes exchanging its role
  // PIN for a Firebase token. Observe authentication so the realtime listener
  // attaches as soon as that token arrives instead of failing once forever.
  firebaseAuthUnsubscribe = onIdTokenChanged(firebaseAuth, (user) => {
    if (isDisposed) return;
    if (!user) {
      firebaseUnsubscribe();
      firebaseUnsubscribe = () => {};
      attachedFirebaseUid = null;
      ensureFallbackPolling();
      return;
    }
    attachFirebaseSubscription();
  });

  void ensureFirebaseAuthReady()
    .then(() => {
      attachFirebaseSubscription();
    })
    .catch((error) => {
      emitConnectionState(false);
      console.error(`Firebase auth bootstrap failed for ${key}`, error);
      ensureFallbackPolling();
    });

  return () => {
    isDisposed = true;
    window.removeEventListener("lighthouse-storage-updated", handleCustomEvent as EventListener);
    window.removeEventListener("storage", handleStorageEvent);
    window.removeEventListener("online", resumeFallbackPolling);
    document.removeEventListener("visibilitychange", resumeFallbackPolling);
    firebaseUnsubscribe();
    firebaseAuthUnsubscribe();
    stopFallbackPolling();
    if (firebaseRetryTimer !== null) window.clearTimeout(firebaseRetryTimer);
    if (pendingReconcileTimer !== null) window.clearInterval(pendingReconcileTimer);
  };
}

export function removeStorageValueFromFirebase(key: string) {
  if (typeof window === "undefined") return;
  void ensureFirebaseAuthReady()
    .then(() => remove(ref(firebaseDatabase, toStoragePath(key))))
    .then(() => markSyncHealthy(key))
    .catch((error) => {
      console.error(`Firebase remove failed for ${key}`, error);
      if (!SERVER_SYNC_FALLBACK_ENABLED) {
        emitConnectionState(false);
        return;
      }
      void removeServerSyncedStorageValue(key)
        .then(() => markSyncHealthy(key))
        .catch((serverError) => {
          emitConnectionState(false);
          console.error(`Server sync delete fallback failed for ${key}`, serverError);
        });
    });
}

export function clearLocalBusinessState() {
  if (typeof window === "undefined") return;

  [...FIREBASE_SYNC_KEYS, ...LEGACY_DEMO_KEYS].forEach((key) => {
    removeLocalCache(key);
  });
}

// Runs `action` at most once across all devices by recording a completion
// marker in the backend node (plus a localStorage fast-path marker so devices
// that already ran the action skip it). A purge guarded only
// by localStorage re-runs on every new browser and deletes data recorded since
// the last run — the backend marker prevents that.
export async function runOnceAcrossDevices(markerKey: string, action: () => Promise<void>) {
  if (typeof window === "undefined") return;
  const localMarker = `${markerKey}`;
  if (window.localStorage.getItem(localMarker) === "1") return;

  try {
    await ensureFirebaseAuthReady();
    const markerRef = ref(firebaseDatabase, toStoragePath(markerKey));
    const marker = await get(markerRef);
    // If the backend marker cannot be verified, do nothing — never run a
    // destructive action blindly. The next load retries.
    if (marker.exists()) {
      window.localStorage.setItem(localMarker, "1");
      return;
    }
    await action();
    await set(markerRef, { done: true, at: Date.now() });
    window.localStorage.setItem(localMarker, "1");
  } catch {
    // Leave markers unset so a later load can retry.
  }
}

// Clear selected Lighthouse keys from both the offline cache and cloud node.
// Resolve only after the backend delete completes so a later reset cannot be
// overwritten by an older pending deletion.
export async function purgeSyncedKeys(keys: string[]) {
  if (typeof window === "undefined") return;

  keys.forEach((key) => {
    removeLocalCache(key);
    dispatchStorageUpdated(key);
  });

  try {
    await ensureFirebaseAuthReady();
    await Promise.all(
      keys.map((key) => remove(ref(firebaseDatabase, toStoragePath(key))).catch(() => null)),
    );
  } catch {
    if (SERVER_SYNC_FALLBACK_ENABLED) {
      await Promise.all(keys.map((key) => removeServerSyncedStorageValue(key).catch(() => null)));
    }
  }

}

export async function clearFirebaseBusinessState() {
  try {
    await ensureFirebaseAuthReady();
    await Promise.all([...FIREBASE_SYNC_KEYS, ...LEGACY_DEMO_KEYS].map((key) => remove(ref(firebaseDatabase, toStoragePath(key))).catch(() => null)));
    markSyncHealthy();
  } catch {
    if (SERVER_SYNC_FALLBACK_ENABLED) {
      await Promise.all([...FIREBASE_SYNC_KEYS, ...LEGACY_DEMO_KEYS].map((key) => removeServerSyncedStorageValue(key).catch(() => null)));
      markSyncHealthy();
    } else {
      emitConnectionState(false);
    }
  }
}

export async function runOneTimeBusinessDataReset(resetVersion: string) {
  if (typeof window === "undefined") return;

  const markerKey = "lighthouse-business-reset-version";
  if (localStorage.getItem(markerKey) === resetVersion) return;

  clearLocalBusinessState();
  await clearFirebaseBusinessState();
  localStorage.setItem(markerKey, resetVersion);
}

// ── Sync diagnostics ────────────────────────────────────────────────────────

export interface SyncKeyDiagnostic {
  key: string;
  localRecordCount: number;
  lastSyncedAt: number | null;
}

export interface SyncDiagnostics {
  connected: boolean;
  keys: SyncKeyDiagnostic[];
}

function countRecords(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (Array.isArray(value)) return value.length;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length;
  return 1;
}

export function getSyncDiagnostics(): SyncDiagnostics {
  const keys: SyncKeyDiagnostic[] = FIREBASE_SYNC_KEYS.map((key) => {
    const raw = typeof window !== "undefined" ? getLocalCacheRaw(key) : null;
    let localRecordCount = 0;
    if (raw) {
      try {
        localRecordCount = countRecords(JSON.parse(raw));
      } catch {
        localRecordCount = 0;
      }
    }
    return {
      key,
      localRecordCount,
      lastSyncedAt: _lastSyncedAt[key] ?? null,
    };
  });

  return {
    connected: _isConnected,
    keys,
  };
}

export async function getRemoteRecordCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  try {
    await ensureFirebaseAuthReady();
    await Promise.all(
      FIREBASE_SYNC_KEYS.map(async (key) => {
        try {
          const snapshot = await get(ref(firebaseDatabase, toStoragePath(key)));
          counts[key] = snapshot.exists() ? countRecords(snapshot.val()) : 0;
        } catch {
          counts[key] = -1;
        }
      }),
    );
    markSyncHealthy();
  } catch {
    if (SERVER_SYNC_FALLBACK_ENABLED) {
      await Promise.all(
        FIREBASE_SYNC_KEYS.map(async (key) => {
          try {
            const value = await fetchServerSyncedStorageValue(key);
            counts[key] = countRecords(value);
          } catch {
            counts[key] = -1;
          }
        }),
      );
    } else {
      FIREBASE_SYNC_KEYS.forEach((key) => { counts[key] = -1; });
    }
  }
  return counts;
}

export async function wipeStorageCategory(key: string) {
  if (typeof window === "undefined") return;
  const defaultValue = sanitizeForStorage(getCanonicalDefaultValue(key));

  // Wipe locally
  setLocalCache(key, JSON.stringify(defaultValue));

  try {
    await ensureFirebaseAuthReady();
    await set(ref(firebaseDatabase, toStoragePath(key)), defaultValue);
    markSyncHealthy(key);
  } catch {
    if (SERVER_SYNC_FALLBACK_ENABLED) {
      await writeServerSyncedStorageValue(key, defaultValue);
      markSyncHealthy(key);
    } else {
      emitConnectionState(false);
    }
  }

  // Trigger local state updates
  dispatchStorageUpdated(key);
}
