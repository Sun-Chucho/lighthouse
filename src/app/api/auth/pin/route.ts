import { NextRequest, NextResponse } from "next/server";
import { getLighthouseAdminAuth } from "@/app/lib/firebase-admin-server";
import type { Role } from "@/app/lib/mock-data";

export const runtime = "nodejs";

const VALID_ROLES = new Set<Role>(["manager", "director", "inventory", "cashier", "kitchen", "barista"]);
const attempts = new Map<string, { count: number; resetAt: number }>();

function requestAddress(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
}

function isLimited(address: string) {
  const now = Date.now();
  const current = attempts.get(address);
  if (!current || now >= current.resetAt) {
    attempts.set(address, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  current.count += 1;
  return current.count > 12;
}

export async function POST(request: NextRequest) {
  const address = requestAddress(request);
  if (isLimited(address)) return NextResponse.json({ error: "Too many attempts." }, { status: 429 });

  try {
    const body = (await request.json()) as { role?: Role; password?: string };
    const role = body.role;
    if (!role || !VALID_ROLES.has(role)) return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    const expectedPassword = role === "manager" ? "4321" : "1234";
    if (body.password !== expectedPassword) return NextResponse.json({ error: "Invalid password." }, { status: 401 });

    const token = await getLighthouseAdminAuth().createCustomToken(`lighthouse-${role}`, {
      role,
      staffRole: role,
    });
    return NextResponse.json({ token }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("PIN authentication failed", error);
    return NextResponse.json({ error: "Cloud authentication is unavailable." }, { status: 503 });
  }
}
