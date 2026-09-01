import { NextResponse } from "next/server";
import { readServerSyncedStorageValue } from "@/app/lib/firebase-server";
import { mergeKitchenMenuItems, type KitchenMenuItem } from "@/app/lib/kitchen-menu";
import type { PublicMenuItem } from "@/app/lib/menu-orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PosSnapshot<T> = { menuItems?: T[] } | null;
type BarMenuItem = {
  id?: unknown;
  name?: unknown;
  price?: unknown;
  category?: unknown;
  prepMinutes?: unknown;
  deletedAt?: unknown;
};

function toKitchenItems(snapshot: PosSnapshot<KitchenMenuItem>): PublicMenuItem[] {
  return mergeKitchenMenuItems(Array.isArray(snapshot?.menuItems) ? snapshot.menuItems : [])
    .filter((entry) => !(entry as KitchenMenuItem & { deletedAt?: number }).deletedAt)
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      price: entry.price,
      category: entry.category,
      department: "kitchen",
      description: entry.description,
      prepMinutes: entry.prepMinutes,
    }));
}

function toBarItems(snapshot: PosSnapshot<BarMenuItem>): PublicMenuItem[] {
  const entries = Array.isArray(snapshot?.menuItems) ? snapshot.menuItems : [];
  return entries.flatMap((entry) => {
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    const price = Number(entry.price);
    if (!id || !name || !Number.isFinite(price) || price <= 0 || entry.deletedAt) return [];
    return [{
      id,
      name,
      price,
      category: typeof entry.category === "string" ? entry.category : "drinks",
      department: "bar" as const,
      prepMinutes: Number.isFinite(Number(entry.prepMinutes)) ? Number(entry.prepMinutes) : undefined,
    }];
  });
}

export async function GET() {
  try {
    const [kitchenSnapshot, barSnapshot] = await Promise.all([
      readServerSyncedStorageValue<PosSnapshot<KitchenMenuItem>>("lighthouse-kitchen-state"),
      readServerSyncedStorageValue<PosSnapshot<BarMenuItem>>("lighthouse-barista-state"),
    ]);
    return NextResponse.json(
      { kitchen: toKitchenItems(kitchenSnapshot), bar: toBarItems(barSnapshot), updatedAt: Date.now() },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("Public menu read failed", error);
    return NextResponse.json({ error: "The menu is temporarily unavailable." }, { status: 503 });
  }
}
