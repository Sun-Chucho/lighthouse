import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { appendServerSyncedStorageItem, readServerSyncedStorageValue } from "@/app/lib/firebase-server";
import { mergeKitchenMenuItems, type KitchenMenuItem } from "@/app/lib/kitchen-menu";
import {
  STORAGE_WEBSITE_MENU_ORDERS,
  type PublicMenuItem,
  type WebsiteMenuOrder,
} from "@/app/lib/menu-orders";

export const runtime = "nodejs";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;
const requestCounts = new Map<string, { count: number; resetAt: number }>();

const orderSchema = z.object({
  department: z.enum(["bar", "kitchen"]),
  customerName: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(7).max(24).regex(/^[+0-9\s().-]+$/),
  destination: z.string().trim().min(2).max(80),
  note: z.string().trim().max(300).optional().default(""),
  website: z.string().optional().default(""),
  lines: z.array(z.object({ itemId: z.string().trim().min(1).max(120), qty: z.number().int().min(1).max(20) })).min(1).max(20),
});

type BarMenuItem = { id?: unknown; name?: unknown; price?: unknown; category?: unknown; deletedAt?: unknown };
type PosSnapshot<T> = { menuItems?: T[] } | null;

function getClientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function isRateLimited(ip: string) {
  const now = Date.now();
  const current = requestCounts.get(ip);
  if (!current || now >= current.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  if (current.count >= RATE_LIMIT_MAX) return true;
  current.count += 1;
  return false;
}

function hasTrustedOrigin(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const source = request.headers.get("origin") || request.headers.get("referer");
  if (!host || !source) return false;
  try { return new URL(source).host === host; } catch { return false; }
}

async function getLiveMenu(department: "bar" | "kitchen"): Promise<PublicMenuItem[]> {
  if (department === "kitchen") {
    const snapshot = await readServerSyncedStorageValue<PosSnapshot<KitchenMenuItem>>("lighthouse-kitchen-state");
    return mergeKitchenMenuItems(Array.isArray(snapshot?.menuItems) ? snapshot.menuItems : [])
      .filter((entry) => !(entry as KitchenMenuItem & { deletedAt?: number }).deletedAt)
      .map((entry) => ({ ...entry, department: "kitchen" as const }));
  }

  const snapshot = await readServerSyncedStorageValue<PosSnapshot<BarMenuItem>>("lighthouse-barista-state");
  return (Array.isArray(snapshot?.menuItems) ? snapshot.menuItems : []).flatMap((entry) => {
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    const price = Number(entry.price);
    if (!id || !name || !Number.isFinite(price) || price <= 0 || entry.deletedAt) return [];
    return [{ id, name, price, category: typeof entry.category === "string" ? entry.category : "drinks", department: "bar" as const }];
  });
}

export async function POST(request: NextRequest) {
  try {
    if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
      return NextResponse.json({ error: "Unsupported request format." }, { status: 415 });
    }
    if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "Invalid order source." }, { status: 403 });
    if (isRateLimited(getClientIp(request))) return NextResponse.json({ error: "Too many requests. Please wait and try again." }, { status: 429 });

    const parsed = orderSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid order." }, { status: 400 });
    if (parsed.data.website) return NextResponse.json({ error: "Invalid order." }, { status: 400 });

    const liveMenu = await getLiveMenu(parsed.data.department);
    const byId = new Map(liveMenu.map((entry) => [entry.id, entry]));
    const lines = parsed.data.lines.map((line) => {
      const menuItem = byId.get(line.itemId);
      if (!menuItem) throw new Error("MENU_ITEM_UNAVAILABLE");
      return { itemId: menuItem.id, name: menuItem.name, price: menuItem.price, qty: line.qty };
    });
    const now = Date.now();
    const prefix = parsed.data.department === "bar" ? "BAR" : "KIT";
    const order: WebsiteMenuOrder = {
      id: `web-menu-${now}-${crypto.randomUUID().slice(0, 8)}`,
      reference: `${prefix}-${String(now).slice(-6)}`,
      department: parsed.data.department,
      customerName: parsed.data.customerName,
      phone: parsed.data.phone,
      destination: parsed.data.destination,
      note: parsed.data.note,
      lines,
      total: lines.reduce((sum, line) => sum + line.price * line.qty, 0),
      status: "new",
      createdAt: now,
      updatedAt: now,
    };
    await appendServerSyncedStorageItem(STORAGE_WEBSITE_MENU_ORDERS, order);
    return NextResponse.json({ ok: true, reference: order.reference, total: order.total }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "MENU_ITEM_UNAVAILABLE") {
      return NextResponse.json({ error: "A selected menu item is no longer available. Refresh and try again." }, { status: 409 });
    }
    console.error("Website menu order failed", error);
    return NextResponse.json({ error: "Your order could not be sent. Please call the lodge." }, { status: 500 });
  }
}
