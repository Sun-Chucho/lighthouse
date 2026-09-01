import { resolve } from "node:path";
import dotenv from "dotenv";
import { BARISTA_INVENTORY_SEED } from "../src/app/lib/seed-barista-data.ts";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });
const { readServerSyncedStorageValue, writeServerSyncedStorageValue } = await import("../src/app/lib/firebase-server.ts");

const inventoryKey = "lighthouse-inventory-items";
const storeKey = "lighthouse-main-store-items";
const stateKey = "lighthouse-barista-state";
const backupKey = "lighthouse-bar-stock-backup-2026-09-01";
const now = Date.now();

const [currentInventoryRaw, currentStoreRaw, currentStateRaw, existingBackup] = await Promise.all([
  readServerSyncedStorageValue(inventoryKey),
  readServerSyncedStorageValue(storeKey),
  readServerSyncedStorageValue(stateKey),
  readServerSyncedStorageValue(backupKey),
]);
const currentInventory = Array.isArray(currentInventoryRaw) ? currentInventoryRaw : [];
const currentStore = Array.isArray(currentStoreRaw) ? currentStoreRaw : [];
const currentState = currentStateRaw && typeof currentStateRaw === "object" ? currentStateRaw : {};

if (!existingBackup) {
  await writeServerSyncedStorageValue(backupKey, {
    createdAt: new Date(now).toISOString(),
    inventoryItems: currentInventory.filter((entry) => String(entry.category || "").toLowerCase() !== "kitchen"),
    storeItems: currentStore.filter((entry) => entry.lane === "barista"),
    menuItems: Array.isArray(currentState.menuItems) ? currentState.menuItems : [],
  });
}

const categoryMap = {
  Spirits: "spirits",
  Wine: "wine",
  Beer: "beer",
  Cider: "cider",
  Malt: "malt",
  "Soft Drinks": "soft-drinks",
  "Water / Juice": "water-juice",
  "Energy Drinks": "energy-drinks",
};
const inventoryItems = BARISTA_INVENTORY_SEED.map((entry, index) => ({ ...entry, updatedAt: now + index }));
const storeItems = BARISTA_INVENTORY_SEED.map((entry, index) => ({
  id: entry.id,
  name: entry.name,
  size: entry.size,
  stock: entry.stock,
  unit: entry.unit,
  minStock: entry.minStock,
  lane: "barista",
  subCategory: entry.subCategory,
  buyingPrice: entry.buyingPrice,
  sellingPrice: entry.sellingPrice,
  updatedAt: now + index,
}));
const menuItems = BARISTA_INVENTORY_SEED.map((entry, index) => ({
  id: `bar-menu-${entry.id.replace(/^bar-stock-/, "")}`,
  name: entry.size ? `${entry.name} ${entry.size}` : entry.name,
  price: entry.sellingPrice,
  buyingPrice: entry.buyingPrice,
  category: categoryMap[entry.subCategory] || "cold",
  prepMinutes: 2,
  barcode: entry.barcode,
  sourceStoreItemId: entry.id,
  updatedAt: now + index,
}));

await writeServerSyncedStorageValue(inventoryKey, [
  ...currentInventory.filter((entry) => String(entry.category || "").toLowerCase() === "kitchen"),
  ...inventoryItems,
]);
await writeServerSyncedStorageValue(storeKey, [
  ...currentStore.filter((entry) => entry.lane !== "barista"),
  ...storeItems,
]);
await writeServerSyncedStorageValue(stateKey, {
  ...currentState,
  tickets: Array.isArray(currentState.tickets) ? currentState.tickets : [],
  ticketSeq: Number.isFinite(Number(currentState.ticketSeq)) ? Number(currentState.ticketSeq) : 1,
  payments: Array.isArray(currentState.payments) ? currentState.payments : [],
  menuItems,
});

const [verifiedInventoryRaw, verifiedStoreRaw, verifiedState] = await Promise.all([
  readServerSyncedStorageValue(inventoryKey),
  readServerSyncedStorageValue(storeKey),
  readServerSyncedStorageValue(stateKey),
]);
const verifiedInventory = Array.isArray(verifiedInventoryRaw) ? verifiedInventoryRaw.filter((entry) => String(entry.category || "").toLowerCase() !== "kitchen") : [];
const verifiedStore = Array.isArray(verifiedStoreRaw) ? verifiedStoreRaw.filter((entry) => entry.lane === "barista") : [];
const verifiedMenu = Array.isArray(verifiedState?.menuItems) ? verifiedState.menuItems : [];
if (verifiedInventory.length !== 60 || verifiedStore.length !== 60 || verifiedMenu.length !== 60) {
  throw new Error(`Bar stock verification failed: inventory=${verifiedInventory.length}, store=${verifiedStore.length}, menu=${verifiedMenu.length}.`);
}

const capital = verifiedStore.reduce((sum, entry) => sum + Number(entry.stock || 0) * Number(entry.buyingPrice || 0), 0);
console.log(`Published and verified ${verifiedStore.length} bar stock items and ${verifiedMenu.length} Bar POS prices.`);
console.log(`Bar capital from closing stock × per-unit buying price: TSh ${capital.toLocaleString("en-US", { maximumFractionDigits: 2 })}.`);
console.log(`Preserved ${Array.isArray(currentState.tickets) ? currentState.tickets.length : 0} tickets and ${Array.isArray(currentState.payments) ? currentState.payments.length : 0} payments.`);
console.log(`Original bar data backup: ${backupKey}.`);
