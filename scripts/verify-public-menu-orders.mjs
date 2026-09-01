import { resolve } from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });
const { readServerSyncedStorageValue, writeServerSyncedStorageValue } = await import("../src/app/lib/firebase-server.ts");

const storageKey = "lighthouse-website-menu-orders";
const response = await fetch("http://localhost:3000/api/menu-orders", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Origin: "http://localhost:3000",
    Referer: "http://localhost:3000/menu",
  },
  body: JSON.stringify({
    department: "kitchen",
    customerName: "System Verification",
    phone: "+255700000000",
    destination: "Test only",
    note: "Temporary automated verification; remove after receipt.",
    website: "",
    lines: [{ itemId: "kitchen-tomato-soup", qty: 1 }],
  }),
});
const payload = await response.json();
if (!response.ok || !payload.reference) throw new Error(`Order API failed (${response.status}): ${JSON.stringify(payload)}`);

const orders = await readServerSyncedStorageValue(storageKey);
const received = Array.isArray(orders) ? orders.find((entry) => entry.reference === payload.reference) : null;
if (!received || received.total !== 10000 || received.department !== "kitchen") {
  throw new Error("The temporary order was not stored with the expected department and selling price.");
}

const cleaned = orders.filter((entry) => entry.reference !== payload.reference);
await writeServerSyncedStorageValue(storageKey, cleaned);
const verifiedCleanup = await readServerSyncedStorageValue(storageKey);
if (Array.isArray(verifiedCleanup) && verifiedCleanup.some((entry) => entry.reference === payload.reference)) {
  throw new Error("Temporary verification order cleanup failed.");
}

console.log(`Verified order ${payload.reference}: API -> Firebase -> kitchen request queue.`);
console.log("Removed the temporary verification order after the test.");
