import Link from "next/link";
import { updateWebsiteBookingPaymentServer } from "@/app/lib/website-bookings-server";

export default async function PaymentCancelPage({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string }>;
}) {
  const params = await searchParams;
  if (params.booking) {
    await updateWebsiteBookingPaymentServer(params.booking, "cancelled", "CANCELLED_BY_RETURN");
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#f8f6f3] px-4 py-12 text-black">
      <section className="w-full max-w-xl rounded-sm border border-black/10 bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.10)] sm:p-8">
        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-600">Payment Cancelled</p>
        <h1 className="mt-3 font-headline text-4xl leading-tight">Your reservation payment was not completed</h1>
        <p className="mt-4 text-sm leading-7 text-black/65">
          No card payment was completed. You can return to the booking form and start a new secure checkout.
        </p>
        {params.booking ? (
          <p className="mt-5 rounded-sm border border-black/10 bg-black/[0.03] px-4 py-3 text-sm font-bold text-black/65">
            Booking reference: {params.booking}
          </p>
        ) : null}
        <Link
          href="/#book"
          className="mt-6 inline-flex items-center justify-center bg-black px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-white transition hover:bg-amber-500"
        >
          Try Again
        </Link>
      </section>
    </main>
  );
}
