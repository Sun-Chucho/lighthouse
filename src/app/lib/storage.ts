import { getUnifiedLocalKey, removeStorageValueFromFirebase, syncStorageValueToFirebase } from "@/app/lib/firebase-sync";
import { sanitizeForStorage } from "@/app/lib/storage-sanitize";
import { sanitizeLighthouseHistory } from "@/app/lib/lighthouse-history";

export const STORAGE_CASHIER_STATE = "lighthouse-cashier-state";
export const STORAGE_KITCHEN_STATE = "lighthouse-kitchen-state";
export const STORAGE_BARISTA_STATE = "lighthouse-barista-state";
const ERRONEOUS_BOOKING_CLEANUP_MARKER = "lighthouse-maintenance-remove-60000-booking-v1";

// All operational data uses one Lighthouse namespace shared by every role.
export function getScopedStorageKey(baseKey: string): string {
  return baseKey;
}

export function getActiveCashierStateKey(): string {
  return STORAGE_CASHIER_STATE;
}

export function getActiveBaristaStateKey(): string {
  return STORAGE_BARISTA_STATE;
}

export function getActiveKitchenStateKey(): string {
  return STORAGE_KITCHEN_STATE;
}

export function removeKnownErroneousCashierBooking() {
  if (typeof window === "undefined" || localStorage.getItem(ERRONEOUS_BOOKING_CLEANUP_MARKER) === "1") {
    return false;
  }

  const stateKey = getUnifiedLocalKey(STORAGE_CASHIER_STATE);
  const rawState = localStorage.getItem(stateKey);
  if (!rawState) return false;

  try {
    const state = JSON.parse(rawState) as CashierState<{ total?: unknown }>;
    const transactions = Array.isArray(state.transactions) ? state.transactions : [];
    const erroneousMatches = transactions.filter((booking) => Number(booking?.total) === 60_000);
    if (transactions.length !== 2 || erroneousMatches.length !== 1) return false;

    const nextTransactions = transactions.filter((booking) => booking !== erroneousMatches[0]);
    const nextState = { ...state, transactions: nextTransactions };
    localStorage.setItem(stateKey, JSON.stringify(nextState));
    localStorage.setItem(getUnifiedLocalKey("lighthouse-cashier-transactions"), JSON.stringify(nextTransactions));
    localStorage.setItem(ERRONEOUS_BOOKING_CLEANUP_MARKER, "1");
    return true;
  } catch {
    return false;
  }
}

interface CashierState<TTransaction> {
  transactions: TTransaction[];
  receiptSeq: number;
}

interface PosState<TTicket, TPayment, TMenu> {
  tickets: TTicket[];
  ticketSeq: number;
  payments: TPayment[];
  menuItems: TMenu[];
}

export function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(getUnifiedLocalKey(key));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  const sanitizedValue = sanitizeForStorage(sanitizeLighthouseHistory(key, value));
  // Local cache is namespaced for Lighthouse; the base key is used for the
  // change event and backend sync.
  localStorage.setItem(getUnifiedLocalKey(key), JSON.stringify(sanitizedValue));
  window.dispatchEvent(new CustomEvent("lighthouse-storage-updated", { detail: { key } }));
  return syncStorageValueToFirebase(key, sanitizedValue);
}

export function removeJson(key: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(getUnifiedLocalKey(key));
  window.dispatchEvent(new CustomEvent("lighthouse-storage-updated", { detail: { key } }));
  removeStorageValueFromFirebase(key);
}

export function readCashierState<TTransaction>(
  legacyTransactionsKey: string,
  legacySeqKey: string,
  defaultSeq: number,
): CashierState<TTransaction> {
  const activeKey = getActiveCashierStateKey();
  const snapshot = readJson<CashierState<TTransaction>>(activeKey);
  if (snapshot) {
    return {
      transactions: Array.isArray(snapshot.transactions) ? snapshot.transactions : [],
      receiptSeq: Number.isFinite(snapshot.receiptSeq) ? snapshot.receiptSeq : defaultSeq,
    };
  }

  const transactions = readJson<TTransaction[]>(legacyTransactionsKey) ?? [];
  const legacySeqRaw = typeof window === "undefined" ? null : localStorage.getItem(getUnifiedLocalKey(legacySeqKey));
  const parsedSeq = Number(legacySeqRaw);

  return {
    transactions: Array.isArray(transactions) ? transactions : [],
    receiptSeq: Number.isFinite(parsedSeq) && parsedSeq > 0 ? parsedSeq : defaultSeq,
  };
}

export function writeCashierState<TTransaction>(transactions: TTransaction[], receiptSeq: number) {
  return writeJson(getActiveCashierStateKey(), { transactions, receiptSeq });
}

export function readPosState<TTicket, TPayment, TMenu>(
  storageKey: string,
  legacyTicketsKey: string,
  legacySeqKey: string,
  legacyPaymentsKey: string,
  legacyMenuKey: string,
  defaultSeq: number,
): PosState<TTicket, TPayment, TMenu> {
  const snapshot = readJson<PosState<TTicket, TPayment, TMenu>>(storageKey);
  const legacyTickets = readJson<TTicket[]>(legacyTicketsKey) ?? [];
  const legacyPayments = readJson<TPayment[]>(legacyPaymentsKey) ?? [];
  const legacyMenuItems = readJson<TMenu[]>(legacyMenuKey) ?? [];
  if (snapshot) {
    // Once the canonical POS snapshot exists it is the source of truth. Merging
    // the old per-field browser cache on every read resurrected deleted/cleaned
    // tickets and payments, so one stale browser could publish them again.
    return {
      tickets: Array.isArray(snapshot.tickets) ? snapshot.tickets : [],
      ticketSeq: Number.isFinite(snapshot.ticketSeq) ? snapshot.ticketSeq : defaultSeq,
      payments: Array.isArray(snapshot.payments) ? snapshot.payments : [],
      menuItems: Array.isArray(snapshot.menuItems) ? snapshot.menuItems : [],
    };
  }

  const legacySeqRaw = typeof window === "undefined" ? null : localStorage.getItem(getUnifiedLocalKey(legacySeqKey));
  const parsedSeq = Number(legacySeqRaw);

  return {
    tickets: Array.isArray(legacyTickets) ? legacyTickets : [],
    ticketSeq: Number.isFinite(parsedSeq) && parsedSeq > 0 ? parsedSeq : defaultSeq,
    payments: Array.isArray(legacyPayments) ? legacyPayments : [],
    menuItems: Array.isArray(legacyMenuItems) ? legacyMenuItems : [],
  };
}

export function writePosState<TTicket, TPayment, TMenu>(
  storageKey: string,
  tickets: TTicket[],
  ticketSeq: number,
  payments: TPayment[],
  menuItems: TMenu[],
) {
  return writeJson(storageKey, { tickets, ticketSeq, payments, menuItems });
}
