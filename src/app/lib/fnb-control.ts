export type RecipeType = "kitchen" | "cocktail";
export type StockDepartment = "kitchen" | "barista" | "bar";

export interface BeverageCostRow {
  id: string;
  itemName: string;
  openingStock: number;
  purchasedStock: number;
  purchaseCostTotal: number;
  closingStock: number;
  salesRevenue: number;
  createdAt: number;
}

export interface RecipeCostRow {
  id: string;
  recipeName: string;
  recipeType: RecipeType;
  yieldPortions: number;
  batchCost: number;
  sellingPricePerPortion: number;
  createdAt: number;
}

export interface StockSalesRow {
  id: string;
  itemName: string;
  department: StockDepartment;
  openingStock: number;
  stockIn: number;
  stockOut: number;
  salesUnits: number;
  createdAt: number;
}

export const STORAGE_BEVERAGE_COST = "lighthouse-fnb-beverage-cost";
export const STORAGE_RECIPE_COST = "lighthouse-fnb-recipe-cost";
export const STORAGE_STOCK_SALES = "lighthouse-fnb-stock-sales";
