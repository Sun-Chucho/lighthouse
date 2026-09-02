import { resolve } from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });
const { readServerSyncedStorageValue, writeServerSyncedStorageValue } = await import("../src/app/lib/firebase-server.ts");

const inventoryKey = "lighthouse-inventory-items";
const storeKey = "lighthouse-main-store-items";
const stateKey = "lighthouse-barista-state";
const now = Date.now();

const requestedCounts = [
  { id: "bar-stock-coca-cola-bottle", name: "Coca-Cola Bottle", size: "", stock: 20, opening: 22, sold: 6 },
  { id: "bar-stock-jagermeister-200", name: "Jägermeister", size: "200 ml", stock: 4, opening: 5, sold: 1 },
  { id: "bar-stock-captain-morgan-200", name: "Captain Morgan", size: "200 ml", stock: 5, opening: 5, sold: 0, subCategory: "Spirits" },
  { id: "bar-stock-pear-bay-sweet-white", name: "Pearly Bay Sweet White", size: "", stock: 2, opening: 2, sold: 0, subCategory: "Wine" },
  { id: "bar-stock-pear-bay-dry-white", name: "Pearly Bay Dry White", size: "", stock: 1, opening: 1, sold: 0, subCategory: "Wine" },
  { id: "bar-stock-serengeti-apple", name: "Serengeti Apple", size: "", stock: 19, opening: 19, sold: 0, subCategory: "Beer" },
  { id: "bar-stock-gsm-water-500", name: "GSM Water", size: "500 ml", stock: 3, opening: 3, sold: 0, subCategory: "Water / Juice" },
  { id: "bar-stock-kilimanjaro-water-1l", name: "Kilimanjaro Water", size: "1 L", stock: 21, opening: 21, sold: 0 },
];

const [inventoryRaw, storeRaw, baristaStateRaw] = await Promise.all([
  readServerSyncedStorageValue(inventoryKey),
  readServerSyncedStorageValue(storeKey),
  readServerSyncedStorageValue(stateKey),
]);
if (!Array.isArray(inventoryRaw) || !Array.isArray(storeRaw)) {
  throw new Error("The synced inventory or main-store data is unavailable.");
}

const baristaState = baristaStateRaw && typeof baristaStateRaw === "object" ? baristaStateRaw : {};
const completedPayments = Array.isArray(baristaState.payments)
  ? baristaState.payments.filter((payment) => payment?.status === "completed" || payment?.status === "credit")
  : [];
const soldBySourceId = new Map();
for (const payment of completedPayments) {
  for (const line of Array.isArray(payment.lines) ? payment.lines : []) {
    const menuItem = Array.isArray(baristaState.menuItems)
      ? baristaState.menuItems.find((item) => item.id === line.itemId)
      : null;
    if (!menuItem?.sourceStoreItemId) continue;
    soldBySourceId.set(menuItem.sourceStoreItemId, (soldBySourceId.get(menuItem.sourceStoreItemId) || 0) + Number(line.qty || 0));
  }
}

for (const item of requestedCounts) {
  if (item.sold > 0 && soldBySourceId.get(item.id) !== item.sold) {
    throw new Error(`POS sales do not match ${item.name}: expected ${item.sold}, found ${soldBySourceId.get(item.id) || 0}.`);
  }
}

function updateInventory(records) {
  const next = [...records];
  requestedCounts.forEach((requested, index) => {
    const matches = next.map((record, recordIndex) => record.id === requested.id ? recordIndex : -1).filter((recordIndex) => recordIndex >= 0);
    if (matches.length > 1) throw new Error(`Duplicate inventory record: ${requested.id}`);
    const updatedAt = now + index;
    if (matches.length === 1) {
      next[matches[0]] = {
        ...next[matches[0]],
        name: requested.name,
        size: requested.size,
        stock: requested.stock,
        ...(requested.subCategory ? { subCategory: requested.subCategory } : {}),
        updatedAt,
      };
      return;
    }
    next.push({
      id: requested.id,
      barcode: "",
      name: requested.name,
      category: "Bar",
      subCategory: requested.subCategory,
      size: requested.size,
      stock: requested.stock,
      totSold: 0,
      buyingPrice: 0,
      sellingPrice: 0,
      price: 0,
      status: "ACTIVE",
      minStock: 0,
      unit: "Bottle",
      updatedAt,
    });
  });
  return next;
}

function updateStore(records) {
  const next = [...records];
  requestedCounts.forEach((requested, index) => {
    const matches = next.map((record, recordIndex) => record.id === requested.id ? recordIndex : -1).filter((recordIndex) => recordIndex >= 0);
    if (matches.length > 1) throw new Error(`Duplicate main-store record: ${requested.id}`);
    const updatedAt = now + index;
    if (matches.length === 1) {
      next[matches[0]] = {
        ...next[matches[0]],
        name: requested.name,
        size: requested.size,
        stock: requested.stock,
        ...(requested.subCategory ? { subCategory: requested.subCategory } : {}),
        updatedAt,
      };
      return;
    }
    next.push({
      id: requested.id,
      name: requested.name,
      size: requested.size,
      stock: requested.stock,
      unit: "Bottle",
      minStock: 0,
      lane: "barista",
      subCategory: requested.subCategory,
      buyingPrice: 0,
      sellingPrice: 0,
      updatedAt,
    });
  });
  return next;
}

const nextInventory = updateInventory(inventoryRaw);
const nextStore = updateStore(storeRaw);
const pearlyBayItems = requestedCounts.filter((item) => item.id.startsWith("bar-stock-pear-bay-"));
const existingMenuItems = Array.isArray(baristaState.menuItems) ? baristaState.menuItems : [];
const nextMenuItems = [...existingMenuItems];
pearlyBayItems.forEach((requested, index) => {
  const menuId = `bar-menu-${requested.id.replace(/^bar-stock-/, "")}`;
  const matches = nextMenuItems.map((item, itemIndex) => item.id === menuId ? itemIndex : -1).filter((itemIndex) => itemIndex >= 0);
  if (matches.length > 1) throw new Error(`Duplicate Bar POS menu record: ${menuId}`);
  const updatedAt = now + requestedCounts.length + index;
  if (matches.length === 1) {
    nextMenuItems[matches[0]] = {
      ...nextMenuItems[matches[0]],
      name: requested.name,
      category: "wine",
      sourceStoreItemId: requested.id,
      deletedAt: undefined,
      updatedAt,
    };
    return;
  }
  nextMenuItems.push({
    id: menuId,
    name: requested.name,
    price: 0,
    buyingPrice: 0,
    category: "wine",
    prepMinutes: 2,
    barcode: "",
    sourceStoreItemId: requested.id,
    updatedAt,
  });
});
const nextBaristaState = { ...baristaState, menuItems: nextMenuItems };
const backupKey = `lighthouse-bar-stock-count-backup-${new Date(now).toISOString().replace(/[.:]/g, "-")}`;

await writeServerSyncedStorageValue(backupKey, {
  createdAt: new Date(now).toISOString(),
  reason: "Reconcile physical Barista stock counts supplied on 2026-09-02",
  requestedCounts,
  inventoryItems: inventoryRaw.filter((record) => requestedCounts.some((item) => item.id === record.id)),
  storeItems: storeRaw.filter((record) => requestedCounts.some((item) => item.id === record.id)),
  menuItems: existingMenuItems.filter((record) => pearlyBayItems.some((item) => record.sourceStoreItemId === item.id)),
});

try {
  await writeServerSyncedStorageValue(inventoryKey, nextInventory);
  await writeServerSyncedStorageValue(storeKey, nextStore);
  await writeServerSyncedStorageValue(stateKey, nextBaristaState);

  const [verifiedInventory, verifiedStore, verifiedBaristaState] = await Promise.all([
    readServerSyncedStorageValue(inventoryKey),
    readServerSyncedStorageValue(storeKey),
    readServerSyncedStorageValue(stateKey),
  ]);
  for (const requested of requestedCounts) {
    const inventoryMatches = verifiedInventory?.filter((record) => record.id === requested.id) ?? [];
    const storeMatches = verifiedStore?.filter((record) => record.id === requested.id) ?? [];
    if (inventoryMatches.length !== 1 || storeMatches.length !== 1
      || inventoryMatches[0].stock !== requested.stock || storeMatches[0].stock !== requested.stock) {
      throw new Error(`Verification failed for ${requested.id}.`);
    }
  }
  for (const requested of pearlyBayItems) {
    const inventoryItem = verifiedInventory.find((record) => record.id === requested.id);
    const storeItem = verifiedStore.find((record) => record.id === requested.id);
    const menuMatches = Array.isArray(verifiedBaristaState?.menuItems)
      ? verifiedBaristaState.menuItems.filter((record) => record.sourceStoreItemId === requested.id)
      : [];
    if (inventoryItem?.name !== requested.name || storeItem?.name !== requested.name
      || menuMatches.length !== 1 || menuMatches[0].name !== requested.name || menuMatches[0].deletedAt) {
      throw new Error(`Pearly Bay inventory/POS verification failed for ${requested.id}.`);
    }
  }

  const verifiedBarStock = verifiedStore.filter((record) => record.lane === "barista");
  const capital = verifiedBarStock.reduce(
    (sum, record) => sum + Number(record.stock || 0) * Number(record.buyingPrice || 0),
    0,
  );
  console.log("Published and verified the requested Barista stock counts:");
  for (const requested of requestedCounts) {
    console.log(`- ${requested.name}${requested.size ? ` ${requested.size}` : ""}: ${requested.stock} remaining (${requested.sold} sold)`);
  }
  console.log(`Synced Barista products: ${verifiedBarStock.length}`);
  console.log(`Verified Pearly Bay Bar POS items: ${pearlyBayItems.length}`);
  console.log(`Updated bar capital: TSh ${capital.toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
  console.log(`Recovery backup: ${backupKey}`);
} catch (error) {
  await Promise.all([
    writeServerSyncedStorageValue(inventoryKey, inventoryRaw),
    writeServerSyncedStorageValue(storeKey, storeRaw),
    writeServerSyncedStorageValue(stateKey, baristaStateRaw),
  ]);
  throw error;
}
