import { resolve } from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });
const { readServerSyncedStorageValue, writeServerSyncedStorageValue } = await import("../src/app/lib/firebase-server.ts");

const inventoryKey = "lighthouse-inventory-items";
const storeKey = "lighthouse-main-store-items";
const corrections = new Map([
  ["bar-stock-coca-cola-bottle", 25],
  ["bar-stock-kilimanjaro-water-15l", 28],
]);
const now = Date.now();

const [inventoryRaw, storeRaw] = await Promise.all([
  readServerSyncedStorageValue(inventoryKey),
  readServerSyncedStorageValue(storeKey),
]);
if (!Array.isArray(inventoryRaw) || !Array.isArray(storeRaw)) {
  throw new Error("The synced inventory or main-store data is unavailable.");
}

function correct(records, label) {
  const matched = new Set();
  const next = records.map((record, index) => {
    if (!corrections.has(record.id)) return record;
    if (matched.has(record.id)) throw new Error(`Duplicate ${label} record: ${record.id}`);
    matched.add(record.id);
    return { ...record, stock: corrections.get(record.id), updatedAt: now + index };
  });
  for (const id of corrections.keys()) {
    if (!matched.has(id)) throw new Error(`Missing ${label} record: ${id}`);
  }
  return next;
}

const nextInventory = correct(inventoryRaw, "inventory");
const nextStore = correct(storeRaw, "main-store");
const backupKey = `lighthouse-bar-stock-count-backup-${new Date(now).toISOString().replace(/[.:]/g, "-")}`;

await writeServerSyncedStorageValue(backupKey, {
  createdAt: new Date(now).toISOString(),
  reason: "Correct Coca-Cola Bottle and Kilimanjaro Water 1.5 L closing counts",
  inventoryItems: inventoryRaw.filter((record) => corrections.has(record.id)),
  storeItems: storeRaw.filter((record) => corrections.has(record.id)),
});

try {
  await writeServerSyncedStorageValue(inventoryKey, nextInventory);
  await writeServerSyncedStorageValue(storeKey, nextStore);

  const [verifiedInventory, verifiedStore] = await Promise.all([
    readServerSyncedStorageValue(inventoryKey),
    readServerSyncedStorageValue(storeKey),
  ]);
  for (const [id, stock] of corrections) {
    const inventoryItem = verifiedInventory?.find((record) => record.id === id);
    const storeItem = verifiedStore?.find((record) => record.id === id);
    if (inventoryItem?.stock !== stock || storeItem?.stock !== stock) {
      throw new Error(`Verification failed for ${id}.`);
    }
  }

  const barStock = verifiedStore.filter((record) => record.lane === "barista");
  const capital = barStock.reduce(
    (sum, record) => sum + Number(record.stock || 0) * Number(record.buyingPrice || 0),
    0,
  );
  console.log("Published and verified the corrected bar stock counts:");
  for (const [id, stock] of corrections) console.log(`- ${id}: ${stock}`);
  console.log(`Updated bar capital: TSh ${capital.toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
  console.log(`Recovery backup: ${backupKey}`);
} catch (error) {
  await Promise.all([
    writeServerSyncedStorageValue(inventoryKey, inventoryRaw),
    writeServerSyncedStorageValue(storeKey, storeRaw),
  ]);
  throw error;
}
