type BarStockSeedItem = {
  id: string; barcode: string; name: string; category: string; subCategory: string; size: string;
  stock: number; totSold: number; buyingPrice: number; sellingPrice: number; price: number;
  status: "ACTIVE"; minStock: number; unit: string; updatedAt: number;
};

const stock = (id: string, name: string, size: string, quantity: number, sellingPrice: number, buyingPrice: number, subCategory: string): BarStockSeedItem => ({
  id: `bar-stock-${id}`, barcode: "", name, category: "Bar", subCategory, size,
  stock: quantity, totSold: 0, buyingPrice, sellingPrice, price: sellingPrice,
  status: "ACTIVE", minStock: 0, unit: "Bottle", updatedAt: 1,
});

// Source: LIGHT HOUSE STOCK COUNT SP & BP 31ST AUGUST 2026.xlsx.
// PRICE PER UNIT is the private buying price used for capital. SELLING PRICE is
// the customer-facing Bar POS price. Missing buying prices remain zero rather
// than being guessed; those three products are seeded at zero stock.
export const BARISTA_INVENTORY_SEED: BarStockSeedItem[] = [
  stock("konyagi-200", "Konyagi", "200 ml", 7, 5000, 3854.16, "Spirits"),
  stock("konyagi-500", "Konyagi", "500 ml", 8, 12000, 8125, "Spirits"),
  stock("konyagi-750", "Konyagi", "750 ml", 0, 15000, 10333.3333333333, "Spirits"),
  stock("kvant-blue-250", "K-Vant Blue", "250 ml", 12, 5000, 3125, "Spirits"),
  stock("kvant-blue-750", "K-Vant Blue", "750 ml", 3, 13000, 8250, "Spirits"),
  stock("grants-200", "Grant's Scotch Whisky", "200 ml", 0, 15000, 12000, "Spirits"),
  stock("gordons-gin", "Gordon's London Dry Gin", "", 0, 15000, 11500, "Spirits"),
  stock("ballantines-200", "Ballantine's Scotch Whisky", "200 ml", 6, 25000, 15000, "Spirits"),
  stock("jagermeister-200", "Jägermeister", "200 ml", 5, 25000, 20000, "Spirits"),
  stock("jack-daniels-200", "Jack Daniel's Old No. 7", "200 ml", 0, 25000, 23000, "Spirits"),
  stock("black-white", "Black & White Scotch Whisky", "", 6, 15000, 9000, "Spirits"),
  stock("hansons-brandy-200", "Hanson's Choice Brandy", "200 ml", 11, 5000, 3500, "Spirits"),
  stock("campari-200", "Campari Bitter", "200 ml", 5, 25000, 20000, "Spirits"),
  stock("valuer-brandy-200", "Valuer Brandy", "200 ml", 0, 4000, 2500, "Spirits"),
  stock("johnnie-red-200", "Johnnie Walker Red Label", "200 ml", 0, 18000, 14000, "Spirits"),
  stock("jb", "J&B", "", 5, 15000, 11500, "Spirits"),
  stock("smirnoff-vodka-200", "Smirnoff Vodka", "200 ml", 6, 13000, 10000, "Spirits"),
  stock("tzee-lemon-200", "Tzee Lemon", "200 ml", 0, 7000, 4500, "Spirits"),
  stock("gilbeys-gin-200", "Gilbey's Special Dry Gin", "200 ml", 6, 10000, 6500, "Spirits"),
  stock("zanzi-250", "Zanzi", "250 ml", 6, 7000, 5687.5, "Spirits"),
  stock("imagi-sweet-red", "Imagi Fortified Sweet Red", "", 0, 5000, 3958, "Wine"),
  stock("robertson-red-750", "Robertson Sweet Red", "750 ml", 2, 20000, 15000, "Wine"),
  stock("drostdy-red-750", "Drostdy-Hof Sweet Red", "750 ml", 5, 18000, 13333.3333333333, "Wine"),
  stock("drostdy-white-750", "Drostdy-Hof Sweet White", "750 ml", 0, 18000, 14000, "Wine"),
  stock("drostdy-red-375", "Drostdy-Hof Sweet Red", "375 ml", 6, 10000, 6833.33333333333, "Wine"),
  stock("drostdy-grand-cru-375", "Drostdy-Hof Grand Cru White", "375 ml", 0, 10000, 7000, "Wine"),
  stock("four-cousins-red", "Four Cousins Red", "", 0, 18000, 15500, "Wine"),
  stock("four-cousins-white", "Four Cousins White", "", 5, 18000, 15000, "Wine"),
  stock("dompo-red-750", "Dompo Sweet Red Wine", "750 ml", 4, 15000, 11083.3333333333, "Wine"),
  stock("dodoma-red-750", "Dodoma Sweet Red", "750 ml", 0, 15000, 10000, "Wine"),
  stock("altra-wine-750", "Altra Wine", "750 ml", 6, 15000, 11083.33, "Wine"),
  stock("altra-wine-375", "Altra Wine", "375 ml", 0, 10000, 6166.66666666667, "Wine"),
  stock("saint-anna-750", "Saint Anna Sweet Wine", "750 ml", 3, 18000, 13000, "Wine"),
  stock("kilimanjaro-lager", "Kilimanjaro Lager L/S", "", 28, 2000, 1600, "Beer"),
  stock("kilimanjaro-lite", "Kilimanjaro Lite", "", 0, 3000, 0, "Beer"),
  stock("safari-lager", "Safari Lager L/S", "", 19, 2000, 1600, "Beer"),
  stock("castle-lite", "Castle Lite", "", 22, 2000, 1600, "Beer"),
  stock("serengeti-lager", "Serengeti Lager L/S", "", 25, 2000, 1600, "Beer"),
  stock("serengeti-lemon", "Serengeti Lemon", "", 13, 2000, 1600, "Beer"),
  stock("serengeti-lite", "Serengeti Lite", "", 17, 2000, 1640, "Beer"),
  stock("brutal-fruit", "Brutal Fruit", "", 11, 5000, 3333.33333333333, "Cider"),
  stock("smirnoff-ice", "Smirnoff Ice", "", 13, 4000, 2480, "Cider"),
  stock("savanna-dry-330", "Savanna Dry", "330 ml", 14, 5000, 3250, "Cider"),
  stock("desperados", "Desperados", "", 0, 5000, 3250, "Beer"),
  stock("flying-fish", "Flying Fish", "", 0, 3000, 1600, "Beer"),
  stock("heineken", "Heineken", "", 12, 5000, 3179.16666666667, "Beer"),
  stock("windhoek", "Windhoek", "", 12, 5000, 3179.16666666667, "Beer"),
  stock("redds-premium", "Redd's Premium", "", 0, 3000, 1650, "Beer"),
  stock("hill-water-1l", "Hill Water", "1 L", 0, 1000, 533.333333333333, "Water / Juice"),
  stock("hill-water-15l", "Hill Water", "1.5 L", 0, 1500, 0, "Water / Juice"),
  stock("hill-water-05l", "Hill Water", "0.5 L", 0, 800, 0, "Water / Juice"),
  stock("coca-cola-bottle", "Coca-Cola Bottle", "", 25, 1000, 579.166666666667, "Soft Drinks"),
  stock("pepsi-bottle", "Pepsi Bottle", "", 0, 1000, 500, "Soft Drinks"),
  stock("grand-malt-330", "Grand Malt", "330 ml", 6, 3000, 2083.33333333333, "Malt"),
  stock("kilimanjaro-water-1l", "Kilimanjaro Water", "1 L", 0, 1000, 433.333333333333, "Water / Juice"),
  stock("kilimanjaro-water-15l", "Kilimanjaro Water", "1.5 L", 28, 2000, 783.33, "Water / Juice"),
  stock("azam-energy-250", "Azam Energy", "250 ml", 0, 2000, 1000, "Energy Drinks"),
  stock("red-bull-250", "Red Bull Energy", "250 ml", 5, 5000, 3541.66666666667, "Energy Drinks"),
  stock("ceres-tropical", "Ceres Nectar Tropical", "", 7, 7000, 4833.33333333333, "Water / Juice"),
  stock("azam-juice", "Azam Juice", "", 4, 5000, 3250, "Water / Juice"),
];
