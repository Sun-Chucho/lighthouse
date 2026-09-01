import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import {
  readServerSyncedStorageValue,
  writeServerSyncedStorageValue,
} from "@/app/lib/firebase-server";
import { sanitizeLighthouseHistory } from "@/app/lib/lighthouse-history";
import { getLighthouseAdminAuth } from "@/app/lib/firebase-admin-server";
import { mergeSyncRecords } from "@/app/lib/sync-record-conflict";

type RouteContext = {
  params: Promise<{
    key: string;
  }>;
};

const SERVER_SYNC_API_ENABLED = process.env.ENABLE_SERVER_SYNC_API === "true";

function disabledResponse() {
  return NextResponse.json(
    { error: "Server-proxied state sync is disabled; use direct Firebase sync." },
    { status: 503, headers: { "Cache-Control": "private, no-store" } },
  );
}

async function isAuthenticatedStaff(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return false;
  try {
    const decoded = await getLighthouseAdminAuth().verifyIdToken(authorization.slice(7));
    return ["manager", "director", "inventory", "cashier", "kitchen", "barista"].includes(String(decoded.role));
  } catch {
    return false;
  }
}

function unauthorizedResponse() {
  return NextResponse.json(
    { error: "Staff authentication is required." },
    { status: 401, headers: { "Cache-Control": "private, no-store" } },
  );
}

function decodeStorageKey(rawKey: string) {
  return decodeURIComponent(rawKey);
}


function createStorageEtag(value: unknown) {
  return `"${createHash("sha1").update(JSON.stringify(value)).digest("base64url")}"`;
}

function getReadHeaders(etag: string) {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    ETag: etag,
  };
}

function getCashierTransactions(value: unknown) {
  const transactions = (value as { transactions?: unknown[] } | null)?.transactions;
  return Array.isArray(transactions) ? transactions : [];
}

function getCashierReceiptSeq(value: unknown) {
  const receiptSeq = Number((value as { receiptSeq?: unknown } | null)?.receiptSeq);
  return Number.isFinite(receiptSeq) ? receiptSeq : 0;
}

function protectIncomingSyncedValue(key: string, incomingValue: unknown, currentValue: unknown) {
  incomingValue = sanitizeLighthouseHistory(key, incomingValue);
  currentValue = sanitizeLighthouseHistory(key, currentValue);

  if (key === "lighthouse-cashier-state") {
    const currentTransactions = getCashierTransactions(currentValue);
    const incomingTransactions = getCashierTransactions(incomingValue);
    const currentSeq = getCashierReceiptSeq(currentValue);
    const incomingSeq = getCashierReceiptSeq(incomingValue);

    if (currentTransactions.length > 0 && incomingTransactions.length < currentTransactions.length && incomingSeq <= currentSeq) {
      return currentValue;
    }

    return {
      ...(typeof incomingValue === "object" && incomingValue !== null ? incomingValue : {}),
      transactions: mergeSyncRecords(currentTransactions, incomingTransactions),
      receiptSeq: Math.max(currentSeq, incomingSeq),
    };
  }

  if (key === "lighthouse-rooms-state") {
    const currentRooms = Array.isArray(currentValue) ? currentValue : [];
    const incomingRooms = Array.isArray(incomingValue) ? incomingValue : [];
    const currentOccupied = currentRooms.filter((room) => (room as { status?: unknown }).status === "occupied").length;
    const incomingOccupied = incomingRooms.filter((room) => (room as { status?: unknown }).status === "occupied").length;

    if (currentOccupied > 0 && incomingOccupied === 0) {
      return currentValue;
    }
  }

  if (key === "lighthouse-kitchen-state" || key === "lighthouse-barista-state") {
    const currentSnapshot = currentValue as { tickets?: unknown[]; ticketSeq?: unknown; payments?: unknown[]; menuItems?: unknown[] } | null;
    const incomingSnapshot = incomingValue as { tickets?: unknown[]; ticketSeq?: unknown; payments?: unknown[]; menuItems?: unknown[] } | null;
    const currentTickets = Array.isArray(currentSnapshot?.tickets) ? currentSnapshot.tickets : [];
    const incomingTickets = Array.isArray(incomingSnapshot?.tickets) ? incomingSnapshot.tickets : [];
    const currentPayments = Array.isArray(currentSnapshot?.payments) ? currentSnapshot.payments : [];
    const incomingPayments = Array.isArray(incomingSnapshot?.payments) ? incomingSnapshot.payments : [];
    const currentMenuItems = Array.isArray(currentSnapshot?.menuItems) ? currentSnapshot.menuItems : [];
    const incomingMenuItems = Array.isArray(incomingSnapshot?.menuItems) ? incomingSnapshot.menuItems : [];
    const currentSeq = Number(currentSnapshot?.ticketSeq);
    const incomingSeq = Number(incomingSnapshot?.ticketSeq);

    return {
      ...(typeof incomingValue === "object" && incomingValue !== null ? incomingValue : {}),
      tickets: mergeSyncRecords(currentTickets, incomingTickets),
      payments: mergeSyncRecords(currentPayments, incomingPayments),
      menuItems: mergeSyncRecords(currentMenuItems, incomingMenuItems),
      ticketSeq: Math.max(
        Number.isFinite(currentSeq) ? currentSeq : 0,
        Number.isFinite(incomingSeq) ? incomingSeq : 0,
      ),
    };
  }

  if (key === "lighthouse-company-stock" && Array.isArray(currentValue) && Array.isArray(incomingValue)) {
    return mergeSyncRecords(currentValue, incomingValue);
  }

  if (Array.isArray(currentValue) && Array.isArray(incomingValue)) {
    return mergeSyncRecords(currentValue, incomingValue);
  }

  return incomingValue;
}

export async function GET(request: NextRequest, context: RouteContext) {
  if (!SERVER_SYNC_API_ENABLED) return disabledResponse();
  if (!await isAuthenticatedStaff(request)) return unauthorizedResponse();
  try {
    const { key } = await context.params;
    const decodedKey = decodeStorageKey(key);
    const value = sanitizeLighthouseHistory(decodedKey, await readServerSyncedStorageValue(decodedKey));
    const etag = createStorageEtag(value);

    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: getReadHeaders(etag),
      });
    }

    return NextResponse.json({ value }, { headers: getReadHeaders(etag) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read synced storage value." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  if (!SERVER_SYNC_API_ENABLED) return disabledResponse();
  if (!await isAuthenticatedStaff(request)) return unauthorizedResponse();
  try {
    const { key } = await context.params;
    const decodedKey = decodeStorageKey(key);
    const body = (await request.json()) as { value?: unknown };
    const currentValue = await readServerSyncedStorageValue(decodedKey).catch(() => null);
    const incomingValue = body.value ?? null;
    const nextValue = protectIncomingSyncedValue(decodedKey, incomingValue, currentValue);
    await writeServerSyncedStorageValue(decodedKey, nextValue);
    const headers: Record<string, string> = { "Cache-Control": "no-store" };
    // Only let the client reuse this ETag when its local snapshot exactly
    // matches what was committed. A conflict-safe merge may have retained
    // additional remote records that the client still needs to download.
    if (JSON.stringify(nextValue) === JSON.stringify(incomingValue)) {
      headers.ETag = createStorageEtag(nextValue);
    }
    return new NextResponse(null, {
      status: 204,
      headers,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to write synced storage value." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!SERVER_SYNC_API_ENABLED) return disabledResponse();
  if (!await isAuthenticatedStaff(request)) return unauthorizedResponse();
  try {
    const { key } = await context.params;
    await writeServerSyncedStorageValue(decodeStorageKey(key), null);
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete synced storage value." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
