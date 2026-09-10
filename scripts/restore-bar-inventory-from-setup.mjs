import { resolve } from "node:path";
import dotenv from "dotenv";
import { BARISTA_INVENTORY_SEED } from "../src/app/lib/seed-barista-data.ts";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });
const { readServerSyncedStorageValue, writeServerSyncedStorageValue } = await import("../src/app/lib/firebase-server.ts");

const INVENTORY_KEY = "lighthouse-inventory-items";
const STORE_KEY = "lighthouse-main-store-items";
const RESET_MARKER_KEY = "lighthouse-bar-inventory-reset-2026-09-10-v1";
const shouldApply = process.argv.includes("--apply");

// Products found during the verified 2 September reconciliation that were not
// present in the original 31 August spreadsheet import. These are their setup
// opening quantities, before any POS deductions.
const laterSetupItems = [
  { id: "bar-stock-captain-morgan-200", stock: 5 },
  { id: "bar-stock-pear-bay-sweet-white", stock: 2 },
  { id: "bar-stock-pear-bay-dry-white", stock: 1 },
  { id: "bar-stock-serengeti-apple", stock: 19 },
  { id: "bar-stock-gsm-water-500", stock: 3 },
  { id: "bar-stock-kilimanjaro-water-1l", stock: 21 },
];

const setupStock = new Map(BARISTA_INVENTORY_SEED.map((item) => [item.id, item.stock]));
for (const item of laterSetupItems) setupStock.set(item.id, item.stock);

function getBarInventory(records) {
  return records.filter((record) => String(record?.category || "").trim().toLowerCase() !== "kitchen");
}

function getBarStore(records) {
  return records.filter((record) => record?.lane === "barista");
}

function compare(records) {
  const byId = new Map(records.map((record) => [record.id, record]));
  const changes = [];
  const missing = [];
  for (const [id, targetStock] of setupStock) {
    const current = byId.get(id);
    if (!current) {
      missing.push(id);
    } else if (Number(current.stock) !== targetStock || Number(current.totSold || 0) !== 0) {
      changes.push({ id, from: Number(current.stock || 0), to: targetStock });
    }
  }
  return { changes, missing };
}

function restore(records, updatedAt) {
  return records.map((record, index) => {
    if (!setupStock.has(record.id)) return record;
    return {
      ...record,
      stock: setupStock.get(record.id),
      ...(Object.hasOwn(record, "totSold") ? { totSold: 0 } : {}),
      updatedAt: updatedAt + index,
    };
  });
}

const [inventoryRaw, storeRaw, existingMarker] = await Promise.all([
  readServerSyncedStorageValue(INVENTORY_KEY),
  readServerSyncedStorageValue(STORE_KEY),
  readServerSyncedStorageValue(RESET_MARKER_KEY),
]);
if (!Array.isArray(inventoryRaw) || !Array.isArray(storeRaw)) {
  throw new Error("The synced inventory or main-store data is unavailable.");
}

const inventoryAudit = compare(getBarInventory(inventoryRaw));
const storeAudit = compare(getBarStore(storeRaw));
console.log(JSON.stringify({
  baselineProducts: setupStock.size,
  liveBarInventoryProducts: getBarInventory(inventoryRaw).length,
  liveBarStoreProducts: getBarStore(storeRaw).length,
  inventoryChanges: inventoryAudit.changes,
  storeChanges: storeAudit.changes,
  missingFromInventory: inventoryAudit.missing,
  missingFromStore: storeAudit.missing,
}, null, 2));

if (!shouldApply) {
  console.log("Dry run only. Pass --apply to restore setup quantities.");
} else if (existingMarker?.done === true) {
  console.log("The 10 September bar inventory reset is already applied; no data was changed.");
} else if (inventoryAudit.missing.length > 0 || storeAudit.missing.length > 0) {
  throw new Error("Restore stopped because one or more setup products are missing from a synced inventory copy.");
} else {
  const now = Date.now();
  const backupKey = `lighthouse-bar-inventory-pre-reset-backup-${new Date(now).toISOString().replace(/[.:]/g, "-")}`;
  const nextInventory = restore(inventoryRaw, now);
  const nextStore = restore(storeRaw, now + inventoryRaw.length);

  await writeServerSyncedStorageValue(backupKey, {
    createdAt: new Date(now).toISOString(),
    reason: "Before restoring bar inventory to the verified setup baseline",
    inventoryItems: getBarInventory(inventoryRaw),
    storeItems: getBarStore(storeRaw),
  });

  try {
    await writeServerSyncedStorageValue(INVENTORY_KEY, nextInventory);
    await writeServerSyncedStorageValue(STORE_KEY, nextStore);
    await writeServerSyncedStorageValue(RESET_MARKER_KEY, { done: true, resetAt: now, backupKey });

    const [verifiedInventory, verifiedStore] = await Promise.all([
      readServerSyncedStorageValue(INVENTORY_KEY),
      readServerSyncedStorageValue(STORE_KEY),
    ]);
    const verifiedInventoryAudit = compare(getBarInventory(verifiedInventory));
    const verifiedStoreAudit = compare(getBarStore(verifiedStore));
    if (
      verifiedInventoryAudit.changes.length > 0 || verifiedStoreAudit.changes.length > 0
      || verifiedInventoryAudit.missing.length > 0 || verifiedStoreAudit.missing.length > 0
    ) {
      throw new Error("Bar inventory verification failed after the restore.");
    }
    console.log(`Restored and verified ${setupStock.size} setup products in both inventory copies.`);
    console.log(`Recovery backup: ${backupKey}`);
  } catch (error) {
    await Promise.all([
      writeServerSyncedStorageValue(INVENTORY_KEY, inventoryRaw),
      writeServerSyncedStorageValue(STORE_KEY, storeRaw),
    ]);
    throw error;
  }
}
