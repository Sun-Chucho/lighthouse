import { normalizeExpenseRecords } from "@/app/lib/expenses";

const LIGHTHOUSE_ROOM_PRICES: Record<string, number> = {
  "301": 60000,
  "302": 80000,
  "303": 80000,
  "304": 60000,
  "305": 80000,
  "306": 80000,
  "307": 80000,
  "308": 60000,
  "309": 80000,
  "310": 80000,
  "311": 80000,
  "312": 80000,
  "313": 60000,
  "314": 60000,
  "315": 60000,
  "316": 80000,
  "317": 60000,
  "318": 60000,
  "319": 60000,
  "320": 60000,
};

export function sanitizeLighthouseHistory<T>(key: string, value: T): T {
  if (value === null || value === undefined) return value;

  if (key === "lighthouse-rooms-state") {
    const savedRooms = Array.isArray(value) ? value : [];
    const savedByNumber = new Map(
      savedRooms
        .filter((room): room is Record<string, unknown> => typeof room === "object" && room !== null)
        .map((room) => [String(room.number ?? ""), room]),
    );

    return Object.entries(LIGHTHOUSE_ROOM_PRICES).map(([number, price]) => {
      const savedRoom = savedByNumber.get(number);
      const status = savedRoom?.status;
      return {
        id: `r${number}`,
        number,
        type: price === 80000 ? "Classic" : "Luxury",
        status:
          status === "occupied" || status === "cleaning" || status === "maintenance"
            ? status
            : "available",
        price,
      };
    }) as T;
  }

  if (key === "lighthouse-cashier-state" && typeof value === "object") {
    const snapshot = value as Record<string, unknown>;
    const receiptSeq = Number(snapshot.receiptSeq);
    const transactions = Array.isArray(snapshot.transactions)
      ? snapshot.transactions.filter((record) => {
          if (typeof record !== "object" || record === null) return false;
          const booking = record as Record<string, unknown>;
          const roomNumber = String(booking.roomNumber ?? "");
          return LIGHTHOUSE_ROOM_PRICES[roomNumber] === Number(booking.ratePerNight);
        })
      : [];

    return {
      ...snapshot,
      transactions,
      receiptSeq: Number.isFinite(receiptSeq) ? receiptSeq : 1,
    } as T;
  }

  if (key === "lighthouse-expenses") {
    return normalizeExpenseRecords(Array.isArray(value) ? value : []) as T;
  }

  return value;
}
