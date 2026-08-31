
export type Role = 'manager' | 'director' | 'inventory' | 'cashier' | 'kitchen' | 'barista';

export interface User {
  id: string;
  name: string;
  role: Role;
  avatar: string;
}

export const USERS: User[] = [];

export interface Room {
  id: string;
  number: string;
  type: 'Luxury' | 'Classic';
  status: 'available' | 'occupied' | 'cleaning' | 'maintenance';
  price: number;
}

export const DEFAULT_ROOM_PRICE = 60000;
const LIGHTHOUSE_ROOM_NUMBERS = [
  "301", "302", "303", "304", "305", "306", "307", "308", "309", "310",
  "311", "312", "313", "314", "315", "316", "317", "318", "319", "320",
] as const;

const LIGHTHOUSE_ROOM_RULES: Array<{ numbers: readonly string[]; price: number }> = [
  { numbers: ["301", "304", "308", "313", "314", "315", "317", "318", "319", "320"], price: 60000 },
  { numbers: ["302", "303", "305", "306", "307", "309", "310", "311", "312", "316"], price: 80000 },
];

export function getLighthouseRoomPrice(number: string): number {
  const match = LIGHTHOUSE_ROOM_RULES.find((rule) => rule.numbers.includes(number));
  return match?.price ?? DEFAULT_ROOM_PRICE;
}

export function getLighthouseRoomType(price: number): Room['type'] {
  return price === 80000 ? 'Classic' : 'Luxury';
}

const lighthouseRooms: Room[] = LIGHTHOUSE_ROOM_NUMBERS.map((number) => {
  const price = getLighthouseRoomPrice(number);
  return {
    id: `r${number}`,
    number,
    type: getLighthouseRoomType(price),
    status: "available",
    price: price,
  };
});

export const ROOMS: Room[] = [...lighthouseRooms];

export function getDefaultRooms(): Room[] {
  return ROOMS.map((room) => ({ ...room }));
}

export interface InventoryItem {
  id: string;
  barcode: string;
  name: string;
  category: string;
  subCategory?: string;
  size: string;
  stock: number; // Bottles or Units
  totPerBottle?: number;
  totSold: number; // Currently sold tots from the active bottle
  buyingPrice: number;
  sellingPrice: number;
  price?: number;
  status: 'ACTIVE' | 'INACTIVE';
  minStock: number;
  unit: string;
  damages?: number;
  receivedStock?: number;
  updatedAt?: number;
}

export const INVENTORY: InventoryItem[] = [];

export const SALES_HISTORY: Array<{
  date: string;
  totalRevenue: number;
  roomRevenue: number;
  foodAndDrinksRevenue: number;
}> = [];
