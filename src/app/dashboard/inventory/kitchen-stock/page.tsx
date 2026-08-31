import { InventoryControlView } from "@/components/dashboard/inventory-control-view";

export default function KitchenStockPage() {
  return <InventoryControlView initialTab="kitchen-stock" visibleTabs={["kitchen-stock"]} />;
}
