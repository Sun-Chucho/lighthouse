export const ROOM_CATEGORIES = {
  luxury: {
    label: "Luxury",
    price: 60_000,
    rooms: [301, 304, 308, 313, 314, 315, 317, 318, 319, 320],
    image: "/images/luxury-room-main.webp",
  },
  classic: {
    label: "Classic",
    price: 80_000,
    rooms: [302, 303, 305, 306, 307, 309, 310, 311, 312, 316],
    image: "/images/classic-room-main.webp",
  },
} as const;

export type RoomCategory = keyof typeof ROOM_CATEGORIES;

export type Room = {
  number: number;
  category: RoomCategory;
  label: string;
  price: number;
};

export const ROOMS: Room[] = Object.entries(ROOM_CATEGORIES)
  .flatMap(([category, details]) =>
    details.rooms.map((number) => ({
      number,
      category: category as RoomCategory,
      label: details.label,
      price: details.price,
    })),
  )
  .sort((a, b) => a.number - b.number);

export const formatPrice = (price: number) =>
  new Intl.NumberFormat("en-TZ").format(price);
