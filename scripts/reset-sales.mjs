import { deleteApp } from "firebase-admin/app";
import { getDatabaseWithUrl } from "firebase-admin/database";
import { firebaseAdminApp, firebaseProjectId } from "../server/firebase-admin.mjs";

const DATABASE_URL = "https://lighthouse-bf85b-default-rtdb.firebaseio.com";
const ROOT = "lighthouse-v1";
const RESET_VERSION = "2026-09-10-v1";
const shouldApply = process.argv.includes("--apply");

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function summarize(value) {
  if (!value || typeof value !== "object") return { exists: false };
  return {
    exists: true,
    transactions: asArray(value.transactions).length,
    tickets: asArray(value.tickets).length,
    payments: asArray(value.payments).length,
    menuItems: asArray(value.menuItems).length,
  };
}

function countOccupiedRooms(value) {
  return asArray(value).filter((room) => room?.status === "occupied").length;
}

function listRemainingLegacySalesKeys(value) {
  const legacyKeys = [
    "lighthouse-cashier-transactions",
    "lighthouse-cashier-seq",
    "lighthouse-kitchen-tickets",
    "lighthouse-kitchen-seq",
    "lighthouse-kitchen-payments",
    "lighthouse-barista-orders",
    "lighthouse-barista-seq",
    "lighthouse-barista-payments",
  ];
  return legacyKeys.filter((key) => value[key] !== null && value[key] !== undefined);
}

try {
  const database = getDatabaseWithUrl(DATABASE_URL, firebaseAdminApp);
  const rootRef = database.ref(ROOT);
  const snapshot = await rootRef.get();
  const current = snapshot.val() ?? {};
  const cashier = current["lighthouse-cashier-state"] ?? {};
  const kitchen = current["lighthouse-kitchen-state"] ?? {};
  const barista = current["lighthouse-barista-state"] ?? {};

  console.log(`Firebase project: ${firebaseProjectId}`);
  console.log("Current sales:", JSON.stringify({
    version: current["lighthouse-sales-reset"]?.version ?? null,
    rooms: summarize(cashier),
    kitchen: summarize(kitchen),
    bar: summarize(barista),
    occupiedRooms: countOccupiedRooms(current["lighthouse-rooms-state"]),
    remainingLegacySalesKeys: listRemainingLegacySalesKeys(current),
  }));

  if (!shouldApply) {
    console.log("Dry run only. Pass --apply to clear room, kitchen, and bar sales.");
  } else if (current["lighthouse-sales-reset"]?.version === RESET_VERSION) {
    console.log(`Reset ${RESET_VERSION} is already applied; no data was changed.`);
  } else {
    const rooms = asArray(current["lighthouse-rooms-state"]).map((room) => (
      room && typeof room === "object" && room.status === "occupied"
        ? { ...room, status: "available" }
        : room
    ));

    const updates = {
      "lighthouse-cashier-state": { transactions: [], receiptSeq: 1 },
      "lighthouse-kitchen-state": {
        tickets: [],
        ticketSeq: 1,
        payments: [],
        menuItems: asArray(kitchen.menuItems),
      },
      "lighthouse-barista-state": {
        tickets: [],
        ticketSeq: 1,
        payments: [],
        menuItems: asArray(barista.menuItems),
      },
      "lighthouse-cashier-transactions": null,
      "lighthouse-cashier-seq": null,
      "lighthouse-kitchen-tickets": null,
      "lighthouse-kitchen-seq": null,
      "lighthouse-kitchen-payments": null,
      "lighthouse-barista-orders": null,
      "lighthouse-barista-seq": null,
      "lighthouse-barista-payments": null,
      "lighthouse-sales-reset": { version: RESET_VERSION, resetAt: Date.now() },
    };
    if (rooms.length > 0) updates["lighthouse-rooms-state"] = rooms;

    await rootRef.update(updates);

    const verified = (await rootRef.get()).val() ?? {};
    console.log("Reset complete:", JSON.stringify({
      version: verified["lighthouse-sales-reset"]?.version ?? null,
      rooms: summarize(verified["lighthouse-cashier-state"]),
      kitchen: summarize(verified["lighthouse-kitchen-state"]),
      bar: summarize(verified["lighthouse-barista-state"]),
      occupiedRooms: countOccupiedRooms(verified["lighthouse-rooms-state"]),
      remainingLegacySalesKeys: listRemainingLegacySalesKeys(verified),
    }));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await deleteApp(firebaseAdminApp).catch(() => undefined);
}
