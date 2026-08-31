import {
  Room,
  getLighthouseRoomPrice,
  getLighthouseRoomType,
  getDefaultRooms as getDefaultRoomList,
} from "@/app/lib/mock-data";
import { readJson, writeJson } from "@/app/lib/storage";

interface ActiveBookingRoom {
  roomNumber: string;
  status?: "completed" | "credit" | "checked-out";
  checkOutDate?: string;
  checkOutTime?: string;
}

export const STORAGE_ROOMS = "lighthouse-rooms-state";

export function getDefaultRooms(): Room[] {
  return getDefaultRoomList();
}

function normalizeRoomRates(rooms: Room[]): Room[] {
  return rooms.map((room) => {
    const price = getLighthouseRoomPrice(room.number);
    return {
      ...room,
      type: getLighthouseRoomType(price),
      price,
    };
  });
}

export function readRoomsState(): Room[] {
  const saved = readJson<Room[]>(STORAGE_ROOMS);
  if (!Array.isArray(saved) || saved.length === 0) {
    return getDefaultRooms();
  }
  return normalizeRoomRates(saved);
}

function hasSavedRoomsState(): boolean {
  const saved = readJson<Room[]>(STORAGE_ROOMS);
  return Array.isArray(saved) && saved.length > 0;
}

export function writeRoomsState(rooms: Room[]) {
  const normalizedRooms = normalizeRoomRates(rooms);
  const saved = readJson<Room[]>(STORAGE_ROOMS);
  if (Array.isArray(saved) && JSON.stringify(saved) === JSON.stringify(normalizedRooms)) return;
  writeJson(STORAGE_ROOMS, normalizedRooms);
}

function readBaseRooms(baseRooms?: Room[]) {
  return Array.isArray(baseRooms) && baseRooms.length > 0
    ? baseRooms
    : hasSavedRoomsState()
      ? readRoomsState()
      : getDefaultRooms();
}

export function getActiveBookedRoomNumbers(bookings: ActiveBookingRoom[]) {
  return new Set(
    bookings
      .filter((booking) => isBookingStillActive(booking))
      .map((booking) => booking.roomNumber),
  );
}

function reconcileRooms(rooms: Room[], occupiedRooms: Set<string>): Room[] {
  return rooms.map((room) => {
    if (occupiedRooms.has(room.number)) {
      return room.status === "occupied" ? room : { ...room, status: "occupied" as Room["status"] };
    }
    if (room.status === "occupied") {
      return { ...room, status: "available" as Room["status"] };
    }
    return room;
  });
}

export function updateRoomStatusByNumber(roomNumber: string, status: Room["status"], baseRooms?: Room[]): Room[] {
  const nextRooms = readBaseRooms(baseRooms).map((room) =>
    room.number === roomNumber ? { ...room, status } : room,
  );
  writeRoomsState(nextRooms);
  return nextRooms;
}

export function updateRoomStatusById(roomId: string, status: Room["status"], baseRooms?: Room[]): Room[] {
  const nextRooms = readBaseRooms(baseRooms).map((room) =>
    room.id === roomId ? { ...room, status } : room,
  );
  writeRoomsState(nextRooms);
  return nextRooms;
}

export function isBookingStillActive(booking: ActiveBookingRoom) {
  return booking.status !== "checked-out";
}

export function deriveRoomsStateFromBookings(bookings: ActiveBookingRoom[], baseRooms?: Room[]): Room[] {
  return reconcileRooms(readBaseRooms(baseRooms), getActiveBookedRoomNumbers(bookings));
}

export function syncRoomsStateFromBookings(bookings: ActiveBookingRoom[], baseRooms?: Room[]) {
  const nextRooms = deriveRoomsStateFromBookings(bookings, baseRooms);
  writeRoomsState(nextRooms);
  return nextRooms;
}

export function syncRoomsWithActiveBookings(bookings: ActiveBookingRoom[], baseRooms?: Room[]) {
  return syncRoomsStateFromBookings(bookings, baseRooms);
}
