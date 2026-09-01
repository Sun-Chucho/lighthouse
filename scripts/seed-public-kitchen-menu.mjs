import { resolve } from "node:path";
import dotenv from "dotenv";
import { PUBLIC_KITCHEN_MENU } from "../src/app/lib/public-kitchen-menu.ts";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });

const { readServerSyncedStorageValue, writeServerSyncedStorageValue } = await import("../src/app/lib/firebase-server.ts");
const stateKey = "lighthouse-kitchen-state";
const backupKey = "lighthouse-kitchen-menu-backup-2026-09-01";
const current = await readServerSyncedStorageValue(stateKey) ?? {};
const currentMenu = Array.isArray(current.menuItems) ? current.menuItems : [];
const now = Date.now();

if (currentMenu.length > 0) {
  await writeServerSyncedStorageValue(backupKey, {
    createdAt: new Date(now).toISOString(),
    sourceKey: stateKey,
    menuItems: currentMenu,
  });
}

const menuItems = PUBLIC_KITCHEN_MENU.map((entry, index) => ({ ...entry, updatedAt: now + index }));
await writeServerSyncedStorageValue(stateKey, {
  ...current,
  tickets: Array.isArray(current.tickets) ? current.tickets : [],
  ticketSeq: Number.isFinite(Number(current.ticketSeq)) ? Number(current.ticketSeq) : 1,
  payments: Array.isArray(current.payments) ? current.payments : [],
  menuItems,
});

const verified = await readServerSyncedStorageValue(stateKey);
const verifiedMenu = Array.isArray(verified?.menuItems) ? verified.menuItems : [];
if (verifiedMenu.length !== menuItems.length) {
  throw new Error(`Kitchen menu verification failed: expected ${menuItems.length}, received ${verifiedMenu.length}.`);
}

console.log(`Published and verified ${verifiedMenu.length} kitchen menu items.`);
console.log(`Preserved ${Array.isArray(current.tickets) ? current.tickets.length : 0} tickets and ${Array.isArray(current.payments) ? current.payments.length : 0} payments.`);
if (currentMenu.length > 0) console.log(`Backed up ${currentMenu.length} previous menu items to ${backupKey}.`);
