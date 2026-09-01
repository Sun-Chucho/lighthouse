import assert from "node:assert/strict";
import { mergeSyncRecords } from "../src/app/lib/sync-record-conflict.ts";

const legacyRemoteItem = {
  id: "menu-1",
  name: "Old Coffee",
  price: 2_000,
  category: "coffee",
  prepMinutes: 2,
};
const managerEdit = {
  ...legacyRemoteItem,
  name: "House Coffee",
  price: 3_500,
  updatedAt: 2_000,
};

const committedManagerMenu = mergeSyncRecords([legacyRemoteItem], [managerEdit]);
assert.deepEqual(committedManagerMenu, [managerEdit], "A manager menu edit must replace the legacy remote item.");

const stalePosMenu = [{ ...legacyRemoteItem, updatedAt: 1_000 }];
const afterStalePosSale = mergeSyncRecords(committedManagerMenu, stalePosMenu);
assert.deepEqual(
  afterStalePosSale,
  [managerEdit],
  "A stale POS snapshot must not restore the old name or price after recording a sale.",
);

const remoteApplyResult = mergeSyncRecords(stalePosMenu, committedManagerMenu);
assert.deepEqual(remoteApplyResult, [managerEdit], "A second POS device must apply the newer cloud menu revision.");

const cocaCola = { id: "coke-350", name: "Coca-Cola Soda 350ml", price: 2_000, updatedAt: 1_000 };
const fanta = { id: "fanta-350", name: "Fanta Soda 350ml", price: 2_000, updatedAt: 1_000 };
const repricedCocaCola = { ...cocaCola, price: 2_500, updatedAt: 3_000 };
const independentProducts = mergeSyncRecords([cocaCola, fanta], [repricedCocaCola, fanta]);
assert.equal(
  independentProducts.find((item) => item.id === "coke-350")?.price,
  2_500,
  "The selected bar item must receive its new price.",
);
assert.equal(
  independentProducts.find((item) => item.id === "fanta-350")?.price,
  2_000,
  "A different same-size bar product must keep its own price.",
);

const retiredItem = { ...managerEdit, deletedAt: 4_000, updatedAt: 4_000 };
assert.deepEqual(
  mergeSyncRecords([retiredItem], [managerEdit]),
  [retiredItem],
  "A stale POS snapshot must not resurrect a retired menu item.",
);

const legacyManagerEdit = { ...legacyRemoteItem, name: "Legacy Rename", price: 2_750 };
assert.deepEqual(
  mergeSyncRecords([legacyRemoteItem], [legacyManagerEdit]),
  [legacyManagerEdit],
  "Incoming edits must win exact ties while legacy records are migrated to revisions.",
);

const pendingLocalTicket = { id: "ticket-2", createdAt: 2_000, status: "active" };
const existingRemoteTicket = { id: "ticket-1", createdAt: 1_000, status: "active" };
assert.deepEqual(
  mergeSyncRecords([existingRemoteTicket], [pendingLocalTicket]),
  [pendingLocalTicket, existingRemoteTicket],
  "POS record merging must preserve records created on both devices.",
);

console.log("Menu revisions, product identity, retirement, realtime apply, and record-union synchronization verified.");
