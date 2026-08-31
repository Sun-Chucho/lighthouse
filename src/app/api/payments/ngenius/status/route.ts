import { NextRequest, NextResponse } from "next/server";
import { getNgeniusOrderStatus } from "@/app/lib/ngenius";
import { getLighthouseAdminAuth } from "@/app/lib/firebase-admin-server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Staff authentication is required." }, { status: 401 });
  }
  try {
    const decoded = await getLighthouseAdminAuth().verifyIdToken(authorization.slice(7));
    if (typeof decoded.role !== "string") throw new Error("Missing role claim.");
  } catch {
    return NextResponse.json({ error: "Staff authentication is invalid or expired." }, { status: 401 });
  }

  const orderReference = request.nextUrl.searchParams.get("orderReference")?.trim();

  if (!orderReference) {
    return NextResponse.json({ error: "Missing order reference." }, { status: 400 });
  }

  try {
    const order = await getNgeniusOrderStatus(orderReference);
    const payments = order._embedded && typeof order._embedded === "object"
      ? (order._embedded as Record<string, unknown>).payment
      : null;
    const latestPayment = Array.isArray(payments) ? payments[payments.length - 1] : null;
    const paymentState = latestPayment && typeof latestPayment === "object"
      ? (latestPayment as Record<string, unknown>).state
      : null;

    return NextResponse.json(
      {
        ok: true,
        orderReference: order.reference ?? orderReference,
        action: order.action ?? null,
        amount: order.amount ?? null,
        formattedAmount: order.formattedAmount ?? null,
        paymentState: typeof paymentState === "string" ? paymentState : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not retrieve payment status." },
      { status: 502 },
    );
  }
}
